import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncLogRepository } from './sync-log.repository';
import { CronJob } from 'cron';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Customer } from '../users/customer.entity';
import { ProductAdaption } from '../products/product-adaption.entity';
import { Order } from '../orders/order.entity';
import { OrderDetail } from '../orders/order-detail.entity';
import { resolveOrderStatusFromPushSale } from '../orders/order-status.util';
import {
  PushSaleTypeDate,
  SyncStatus,
  SyncTriggerSource,
} from '@sync-project/shared';
import {
  calendarMonthBoundsForDate,
  getAppTimeZone,
  yesterdayCalendarInZone,
} from '../common/app-timezone';
import {
  httpErrorMessage,
  isRetryableHttpError,
} from '../common/http-error.util';
import { HttpRetryService } from '../common/http-retry.service';
import { PUSHSALE_REQUEST_INTERVAL_MS } from '../common/pushsale-request-interval';
import {
  durationPartsFromMs,
  durationPartsSince,
} from '../common/duration-parts';

/**
 * If an error message contains any of these substrings (case-insensitive), {@link HttpRetryService.postJsonWithRetry} waits and retries the same request.
 */
function cloneSyncLogData(data: Record<string, unknown>): object {
  return JSON.parse(JSON.stringify(data)) as object;
}

/** Stable DATE value for TypeORM / MySQL from YYYY-MM-DD. */
function calendarStrToUtcNoonDate(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

const PUSHSALE_RETRYABLE_ERROR_SNIPPETS: readonly string[] = [
  'getaddrinfo EAI_AGAIN pushsale.vn',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  '429',
  'too many requests',
  // PushSale body-level errorCode returned with HTTP 200 + successful=false
  // when the caller exceeds their min-interval throttle.
  'time_limit',
];

interface PushSaleGetOrderResponseBody {
  successful?: boolean;
  errorCode?: string;
  errorMessage?: string;
  result?: unknown[];
}

interface PushSaleOrderDetail {
  itemCode: string;
  itemName: string;
  weightGram?: number;
  quantity?: number;
  price?: number;
  totalPrice?: number;
}

interface PushSaleOrderPayload {
  marketingUserId: number;
  marketingUserName: string;
  marketingDisplayName: string;
  saleUserId: number;
  saleUserName: string;
  saleDisplayName: string;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  customerType?: string;
  details?: PushSaleOrderDetail[];
  orderNumber: string | number;
  totalQuantity?: number;
  totalAmount?: number;
  totalPrice?: number;
  totalDeposit?: number;
  totalDiscount?: number;
  totalShippingCost?: number;
  totalCod?: number;
  reasonToCreate?: string;
  orderStatusName?: string;
  operationResultName?: string;
  orderConfirmDate?: string | Date;
  createTime?: string | Date;
  updateTime?: string | Date;
}

/** Order entity stores these columns as strings; API may send Date. */
function optionalDateTimeString(
  v: string | Date | undefined,
): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  return v.toISOString();
}

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private dailyCronJob: CronJob | null = null;
  /**
   * In-process lock: a single PushSale order sync can saturate PushSale's
   * per-token throttle, and overlapping runs against the same date corrupt
   * sync_logs rows. We never want two background syncs in flight at once.
   */
  private isSyncRunning = false;

  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(ProductAdaption)
    private adaptionRepo: Repository<ProductAdaption>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(OrderDetail)
    private orderDetailRepo: Repository<OrderDetail>,
    private syncLogRepo: SyncLogRepository,
    private readonly httpRetryService: HttpRetryService,
  ) {}

  onModuleInit(): void {
    void this.dailyCronJob?.stop();
    const timeZone = getAppTimeZone();
    const cronExpression =
      process.env.SYNC_CRON_EXPRESSION?.trim() || '5 0 * * *';
    this.dailyCronJob = new CronJob(
      cronExpression,
      () => void this.handleDailySync(),
      null,
      false,
      timeZone,
    );
    this.dailyCronJob.start();
    this.logger.log(
      `Daily PushSale sync cron registered: "${cronExpression}" (${timeZone}).`,
    );

    // Self-heal a missed daily run (process was down at the cron's fire time):
    // on every boot, if yesterday's sync did not finish successfully, kick it off now.
    void this.catchUpMissedDailySync();
  }

  onModuleDestroy(): void {
    void this.dailyCronJob?.stop();
    this.dailyCronJob = null;
  }

  handleDailySync(): void {
    this.logger.log('Starting automated daily PushSale sync...');
    this.syncOrdersFromPushSale(undefined, 1, SyncTriggerSource.Cron);
    this.logger.log('Automated daily PushSale sync dispatched.');
  }

  /**
   * Runs once at boot. If the previous calendar day in APP_TIMEZONE has no
   * completed sync_log row, triggers a sync for that day. Older missed days
   * still need to be re-synced manually via POST /sync/orders.
   */
  private async catchUpMissedDailySync(): Promise<void> {
    try {
      const yesterday = yesterdayCalendarInZone(getAppTimeZone());
      const completed = await this.syncLogRepo.findCompletedOrderSyncForDate(
        yesterday,
      );
      if (completed) {
        this.logger.log(
          `Startup catch-up: sync for ${yesterday} already completed (sync_log #${completed.id}); nothing to do.`,
        );
        return;
      }
      this.logger.warn(
        `Startup catch-up: no completed sync_log for ${yesterday}; triggering sync now.`,
      );
      this.syncOrdersFromPushSale(yesterday, 1, SyncTriggerSource.Cron);
    } catch (err) {
      this.logger.error(
        `Startup catch-up failed: ${httpErrorMessage(err)}. Daily cron will still run as scheduled.`,
      );
    }
  }

  async getSyncLogs(page: number = 1, limit: number = 10) {
    const take = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const qb = this.syncLogRepo
      .createQueryBuilder('log')
      .select('log.id', 'id')
      .addSelect('log.created_at', 'created_at')
      .addSelect('log.updated_at', 'updated_at')
      .addSelect('log.sync_date', 'sync_date')
      .addSelect('log.trigger_source', 'trigger_source')
      .addSelect('log.status', 'status')
      .addSelect('log.error_details', 'error_details')
      .addSelect('log.synced_count', 'synced_count')
      .addSelect('log.page_no', 'page_no')
      .addSelect('log.data', 'data')
      .addSelect(
        `CASE WHEN log.page_no IS NOT NULL AND log.response IS NOT NULL AND CHAR_LENGTH(log.response) > 0 THEN 1 ELSE 0 END`,
        'has_response',
      )
      .orderBy('log.created_at', 'DESC')
      .offset(skip)
      .limit(take);

    const [rawRows, total] = await Promise.all([
      qb.getRawMany<Record<string, unknown>>(),
      this.syncLogRepo.count(),
    ]);

    const data = rawRows.map((row) => ({
      id: Number(row.id),
      created_at: row.created_at,
      updated_at: row.updated_at,
      sync_date: row.sync_date,
      trigger_source: row.trigger_source,
      status: row.status,
      error_details: row.error_details ?? null,
      synced_count: Number(row.synced_count ?? 0),
      page_no:
        row.page_no != null && row.page_no !== ''
          ? Number(row.page_no)
          : null,
      data: row.data ?? null,
      has_response:
        row.has_response === 1 ||
        row.has_response === '1' ||
        row.has_response === true,
    }));

    return { data, total, page: Math.max(Number(page) || 1, 1), limit: take };
  }

  /** Re-fetch one PushSale page and update the existing sync_log row. */
  async resyncSyncLogPage(logId: number) {
    const log = await this.syncLogRepo.findOne({ where: { id: logId } });
    if (!log) {
      throw new BadRequestException(`Sync log #${logId} not found`);
    }
    if (log.page_no == null || log.page_no <= 0 || !log.response?.trim()) {
      throw new BadRequestException(
        'This sync log has no page_no/response; re-sync is not available.',
      );
    }

    if (this.isSyncRunning) {
      return {
        status: 'skipped',
        message: 'Another PushSale sync is already in progress.',
      };
    }

    this.isSyncRunning = true;
    try {
      const defaultPassword = await bcrypt.hash(
        process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!',
        10,
      );
      const result = await this.fetchAndProcessPage({
        dateStr: log.sync_date,
        pageIndex: log.page_no,
        triggerSource: SyncTriggerSource.Api,
        defaultPasswordHash: defaultPassword,
        existingLogId: logId,
      });
      return {
        status: 'success',
        ...result,
      };
    } finally {
      this.isSyncRunning = false;
    }
  }

  /** Re-process orders from the saved PushSale response (no API call). */
  async replaySyncLog(logId: number) {
    const log = await this.syncLogRepo.findOne({
      where: { id: logId },
      select: [
        'id',
        'page_no',
        'response',
        'status',
        'sync_date',
      ],
    });
    if (!log) {
      throw new BadRequestException(`Sync log #${logId} not found`);
    }
    if (log.page_no == null || log.page_no <= 0 || !log.response?.trim()) {
      throw new BadRequestException(
        'This sync log has no page_no/response; replay is not available.',
      );
    }

    let body: PushSaleGetOrderResponseBody;
    try {
      body = JSON.parse(log.response) as PushSaleGetOrderResponseBody;
    } catch {
      throw new BadRequestException('Saved response is not valid JSON.');
    }

    const defaultPassword = await bcrypt.hash(
      process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!',
      10,
    );
    const results = body.result ?? [];
    let syncedCount = 0;
    for (const orderData of results) {
      await this.processOrder(
        orderData as PushSaleOrderPayload,
        defaultPassword,
      );
      syncedCount++;
    }

    await this.syncLogRepo.updateById(logId, {
      status: SyncStatus.Success,
      synced_count: syncedCount,
      error_details: null,
    });

    return {
      status: 'success',
      sync_log_id: logId,
      synced_count: syncedCount,
      records: results.length,
    };
  }

  private sleepMs(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  syncOrdersFromPushSale(
    targetDate?: string,
    pageBegin: number = 1,
    triggerSource: SyncTriggerSource = SyncTriggerSource.Api,
  ) {
    const dateStr = targetDate || yesterdayCalendarInZone(getAppTimeZone());

    if (this.isSyncRunning) {
      this.logger.warn(
        `Sync request for ${dateStr} (trigger=${triggerSource}) ignored: another sync is already running.`,
      );
      return {
        status: 'skipped',
        date: dateStr,
        pageBegin,
        trigger_source: triggerSource,
        message:
          'Another PushSale sync is already in progress; this request was ignored.',
      };
    }
    this.isSyncRunning = true;

    // Fire and forget; lock is released in finally so a crash never leaves it stuck.
    this.runBackgroundSync(dateStr, pageBegin, triggerSource)
      .catch((err) =>
        this.logger.error(
          `Background sync failed for ${dateStr}: ${httpErrorMessage(err)}`,
        ),
      )
      .finally(() => {
        this.isSyncRunning = false;
      });

    return {
      status: 'initiated',
      date: dateStr,
      pageBegin,
      trigger_source: triggerSource,
      message: 'Sync process started in the background.',
    };
  }

  private async runBackgroundSync(
    dateStr: string,
    pageBegin: number = 1,
    triggerSource: SyncTriggerSource = SyncTriggerSource.Api,
  ) {
    const defaultPassword = await bcrypt.hash(
      process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!',
      10,
    );

    let pageIndex = pageBegin;
    let hasMore = true;
    let totalSynced = 0;
    const syncPagesRunStartedAt = Date.now();

    try {
      while (hasMore) {
        const result = await this.fetchAndProcessPage({
          dateStr,
          pageIndex,
          triggerSource,
          defaultPasswordHash: defaultPassword,
        });
        totalSynced += result.records;
        hasMore = result.hasMore;
        pageIndex++;

        if (hasMore) {
          const remaining =
            PUSHSALE_REQUEST_INTERVAL_MS - result.page_duration_ms;
          if (remaining > 0) {
            this.logger.log(`Pacing before next page: ${remaining} ms`);
            await this.sleepMs(remaining);
          }
        }
      }

      const runDur = durationPartsSince(syncPagesRunStartedAt);
      this.logger.log(
        `PushSale sync pages for ${dateStr} finished in ${runDur.ms} ms (${runDur.sec} s); ${totalSynced} orders synced.`,
      );
    } catch (error) {
      const runDur = durationPartsSince(syncPagesRunStartedAt);
      this.logger.error(
        `PushSale sync pages for ${dateStr} failed after ${runDur.ms} ms (${runDur.sec} s): ${httpErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private async fetchAndProcessPage(params: {
    dateStr: string;
    pageIndex: number;
    triggerSource: SyncTriggerSource;
    defaultPasswordHash: string;
    existingLogId?: number;
  }): Promise<{
    records: number;
    hasMore: boolean;
    sync_log_id: number;
    page_duration_ms: number;
  }> {
    const { dateStr, pageIndex, triggerSource, defaultPasswordHash } = params;
    const clientId = process.env.PUSHSALE_CLIENT_ID || '5662';
    const apiToken = process.env.PUSHSALE_API_TOKEN || '';
    const apiUrl =
      process.env.PUSHSALE_API_URL || 'https://pushsale.vn/v1/getdata';
    const typeDate = PushSaleTypeDate.CreatedDate;
    const fromDate = `${dateStr} 00:00:00.001`;
    const toDate = `${dateStr} 23:59:59.001`;

    const pageHandledStartedAt = Date.now();
    let logId = params.existingLogId;

    if (logId == null) {
      const pageLog = await this.syncLogRepo.createRow({
        sync_date: dateStr,
        page_no: pageIndex,
        trigger_source: triggerSource,
        status: SyncStatus.Processing,
        synced_count: 0,
        response: null,
        data: null,
      });
      logId = pageLog.id;
    } else {
      await this.syncLogRepo.updateById(logId, {
        status: SyncStatus.Processing,
        error_details: null,
      });
    }

    this.logger.log(`Fetching page ${pageIndex} for date ${dateStr}`);

    const secureToken = crypto
      .createHash('md5')
      .update(`${apiToken}_${pageIndex}_${typeDate}`)
      .digest('hex');

    const requestBody = {
      clientId,
      secureToken,
      pageIndex,
      pageSize: 100,
      fromDate,
      toDate,
      typeDate,
      isIncludeDetail: 1,
    };

    let lastResponseBody: PushSaleGetOrderResponseBody | undefined;
    try {
      for (;;) {
        try {
          const attempt =
            await this.httpRetryService.postJsonWithRetry<PushSaleGetOrderResponseBody>(
              `${apiUrl}/GetOrderByConditions`,
              requestBody,
              PUSHSALE_RETRYABLE_ERROR_SNIPPETS,
            );

          const httpDur = durationPartsFromMs(attempt.durationMs);
          this.logger.log(
            `GetOrderByConditions for ${dateStr} page ${pageIndex}: HTTP round-trip ${httpDur.ms} ms (${httpDur.sec} s)`,
          );

          const resData = attempt.response.data;
          if (resData && resData.successful === false) {
            throw new Error(`${resData.errorCode}: ${resData.errorMessage}`);
          }
          lastResponseBody = resData;
          break;
        } catch (err) {
          if (!isRetryableHttpError(err, PUSHSALE_RETRYABLE_ERROR_SNIPPETS)) {
            throw err;
          }
          this.logger.warn(
            `Page ${pageIndex} for ${dateStr} retryable error: ${httpErrorMessage(err)}. Waiting ${PUSHSALE_REQUEST_INTERVAL_MS} ms before retry.`,
          );
          await this.sleepMs(PUSHSALE_REQUEST_INTERVAL_MS);
        }
      }

      const responseJson = JSON.stringify(lastResponseBody ?? null);
      const results = lastResponseBody?.result ?? [];
      let syncedCount = 0;

      for (const orderData of results) {
        await this.processOrder(
          orderData as PushSaleOrderPayload,
          defaultPasswordHash,
        );
        syncedCount++;
      }

      const pageDur = durationPartsSince(pageHandledStartedAt);

      await this.syncLogRepo.updateById(logId, {
        status: SyncStatus.Success,
        synced_count: syncedCount,
        response: responseJson,
        data: cloneSyncLogData({
          records: results.length,
          total_ms: pageDur.ms,
          request: requestBody,
        }),
        error_details: null,
      });

      this.logger.log(
        `PushSale page ${pageIndex} for ${dateStr} handled in ${pageDur.ms} ms (${pageDur.sec} s); ${results.length} orders.`,
      );

      return {
        records: results.length,
        hasMore: results.length >= 100,
        sync_log_id: logId,
        page_duration_ms: pageDur.ms,
      };
    } catch (error) {
      const pageDur = durationPartsSince(pageHandledStartedAt);
      const responseJson =
        lastResponseBody != null
          ? JSON.stringify(lastResponseBody)
          : undefined;

      await this.syncLogRepo.updateById(logId, {
        status: SyncStatus.Failed,
        error_details: httpErrorMessage(error),
        ...(responseJson ? { response: responseJson } : {}),
        data: cloneSyncLogData({
          total_ms: pageDur.ms,
          request: requestBody,
          error: httpErrorMessage(error),
        }),
      });
      throw error;
    }
  }

  private async processOrder(
    data: PushSaleOrderPayload,
    defaultPasswordHash: string,
  ) {
    let marketing_user_id: number | null = null;
    if (data.marketingUserId > 0) {
      const u = await this.ensureUser(
        data.marketingUserName,
        data.marketingDisplayName,
        'marketing',
        defaultPasswordHash,
      );
      marketing_user_id = u.id;
    }

    let sale_user_id: number | null = null;
    if (data.saleUserId > 0) {
      const u = await this.ensureUser(
        data.saleUserName,
        data.saleDisplayName,
        'sale',
        defaultPasswordHash,
      );
      sale_user_id = u.id;
    }

    let customer = await this.customerRepo.findOne({
      where: { phone: data.customerPhone },
    });
    if (!customer) {
      customer = await this.customerRepo.save({
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        type: data.customerType || 'default',
      });
    }

    const productIds: number[] = [];
    const adaptionIds: number[] = [];
    const itemCodes: string[] = [];
    const tz = getAppTimeZone();
    const { startStr, endStr, todayStr } = calendarMonthBoundsForDate(
      new Date(),
      tz,
    );
    const monthStartDate = calendarStrToUtcNoonDate(startStr);
    const monthEndDate = calendarStrToUtcNoonDate(endStr);

    for (const detail of data.details || []) {
      if (!detail.itemCode) {
        continue;
      }

      itemCodes.push(detail.itemCode.trim());

      let product = await this.productRepo.findOne({
        where: { item_code: detail.itemCode },
      });
      if (!product) {
        product = await this.productRepo.save({
          item_code: detail.itemCode,
          item_name: detail.itemName,
          cost_price: 0,
          delivery_fee: 0,
          weight_gram: detail.weightGram || 0,
        });
      }
      productIds.push(product.id);

      // Current adaption: start_date <= today <= end_date (inclusive), in app calendar.
      let adaption = await this.adaptionRepo
        .createQueryBuilder('a')
        .where('a.product_id = :pid', { pid: product.id })
        .andWhere('a.start_date <= :today', { today: todayStr })
        .andWhere('(a.end_date IS NULL OR a.end_date >= :today)', {
          today: todayStr,
        })
        .getOne();

      if (!adaption) {
        adaption = await this.adaptionRepo.save({
          product_id: product.id,
          start_date: monthStartDate,
          end_date: monthEndDate,
          cost_price: 0,
          delivery_fee: 0,
          selling_price: detail.price || 0,
        });
      }
      adaptionIds.push(adaption.id);
    }

    const orderPayload = {
      order_number: String(data.orderNumber),
      customer: { id: customer.id },
      marketing_user:
        marketing_user_id != null ? { id: marketing_user_id } : null,
      sale_user: sale_user_id != null ? { id: sale_user_id } : null,
      product_adaption_ids: adaptionIds,
      product_ids: productIds,
      item_codes: itemCodes,
      total_quantity: data.totalQuantity || 0,
      total_amount: data.totalAmount || 0,
      total_price: data.totalPrice || 0,
      total_deposit: data.totalDeposit || 0,
      total_discount: data.totalDiscount || 0,
      total_shipping_cost: data.totalShippingCost || 0,
      total_cod: data.totalCod || 0,
      reason_create: data.reasonToCreate,
      status: resolveOrderStatusFromPushSale(data.orderStatusName) ?? null,
      status_name: data.orderStatusName?.trim() || null,
      operation_result_name: data.operationResultName?.trim() || null,
      confirm_time: optionalDateTimeString(data.orderConfirmDate),
      created_time: optionalDateTimeString(data.createTime),
      updated_time: optionalDateTimeString(data.updateTime),
    };

    const existingOrder = await this.orderRepo.findOne({
      where: { order_number: orderPayload.order_number },
    });
    const savedOrder = existingOrder
      ? await this.orderRepo.save({ id: existingOrder.id, ...orderPayload })
      : await this.orderRepo.save(orderPayload);

    // Replace order_details with a fresh snapshot from the PushSale payload.
    // PushSale is the source of truth for the line items, so on every sync we
    // drop the prior rows for this order and re-insert.
    await this.orderDetailRepo
      .createQueryBuilder()
      .delete()
      .where('order_id = :orderId', { orderId: savedOrder.id })
      .execute();

    const detailRows = (data.details || [])
      .filter((d) => !!d.itemCode)
      .map((d) =>
        // build instances in memory
        this.orderDetailRepo.create({
          order: { id: savedOrder.id } as Order,
          item_code: d.itemCode,
          item_name: d.itemName,
          quantity: d.quantity ?? 0,
          price: d.price ?? 0,
          total_price: d.totalPrice ?? 0,
        }),
      );
    if (detailRows.length > 0) {
      // one batched DB insert
      await this.orderDetailRepo.save(detailRows);
    }
  }

  private async ensureUser(
    username: string,
    displayName: string,
    type: string,
    passwordHash: string,
  ): Promise<User> {
    let user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      user = await this.userRepo.save({
        username,
        password: passwordHash,
        display_name: displayName,
        type: type,
      });
    }
    return user;
  }
}
