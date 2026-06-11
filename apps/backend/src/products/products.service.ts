import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductAdaption } from './product-adaption.entity';
import {
  parseProductRowsFromXls,
  type ProductImportResult,
  type ProductImportRow,
} from '../products/product-import.util';
import {
  calendarMonthBoundsForDate,
  getAppTimeZone,
} from '../common/app-timezone';

export interface PatchProductPricesDto {
  cost_price: number;
  delivery_fee: number;
  /** When provided, updates the adaption's selling_price in place. */
  selling_price?: number;
  /** Optional product-level VAT percentage update (e.g. 6.5, 8.5). */
  tax_value?: number;
}

/** List row: one per adaptation, or one placeholder when the product has no adaptations yet. */
export interface ProductListRow {
  adaption_id: number | null;
  product_id: number;
  item_code: string;
  item_name: string;
  start_date: string | null;
  end_date: string | null;
  cost_price: number;
  selling_price: number;
  delivery_fee: number;
  /** Product-level VAT percentage, e.g. 6.5, 8.5. */
  tax_value: number;
  weight_gram: number;
}

interface ProductListCountRow {
  total: string | number;
}

interface ProductListRawRow {
  adaption_id: number | null;
  product_id: number;
  item_code: string;
  item_name: string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  cost_price: string | number;
  selling_price: string | number;
  delivery_fee: string | number;
  tax_value: string | number;
  weight_gram: number;
}

export interface CreateProductAdaptionDto {
  start_date: string;
  end_date: string;
  cost_price: number;
  delivery_fee: number;
  /** Optional product-level VAT percentage update (e.g. 6.5, 8.5). */
  tax_value?: number;
}

export type ProductImportJobState =
  | 'idle'
  | 'is-processing'
  | 'completed'
  | 'failed';

export interface ProductImportJobStatus {
  state: ProductImportJobState;
  result?: ProductImportResult;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

function calendarDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Stable DATE column value from YYYY-MM-DD. */
function calendarStrToUtcNoonDate(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Log import progress every N rows (large catalogs). */
const PRODUCT_IMPORT_PROGRESS_LOG_INTERVAL = 100;

function formatProductImportResult(result: ProductImportResult): string {
  return [
    `productsCreated=${result.productsCreated}`,
    `productsUpdated=${result.productsUpdated}`,
    `adaptionsCreated=${result.adaptionsCreated}`,
    `adaptionsUpdated=${result.adaptionsUpdated}`,
    `skipped=${result.skipped}`,
    `errors=${result.errors.length}`,
  ].join(', ');
}

function parseYmdOrThrow(label: string, value: string): void {
  if (!YMD_RE.test(value)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  const t = Date.parse(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(t)) {
    throw new BadRequestException(`${label} is not a valid date`);
  }
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private importJob: ProductImportJobStatus = { state: 'idle' };

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductAdaption)
    private readonly adaptionRepo: Repository<ProductAdaption>,
  ) {}

  getProductImportStatus(): ProductImportJobStatus {
    return { ...this.importJob };
  }

  /**
   * Starts XLS import in the background so the HTTP request can return immediately.
   * Only one import runs at a time per process.
   */
  startProductImportFromXls(buffer: Buffer): { message: 'is-processing' } {
    if (this.importJob.state === 'is-processing') {
      this.logger.warn(
        `Product import job ignored: already is-processing (started_at=${this.importJob.started_at ?? 'unknown'})`,
      );
      return { message: 'is-processing' };
    }

    const startedAt = new Date().toISOString();
    this.importJob = {
      state: 'is-processing',
      started_at: startedAt,
    };
    this.logger.log(
      `Product import job started: state=is-processing started_at=${startedAt} fileBytes=${buffer.length}`,
    );

    void this.runProductImportInBackground(buffer);

    return { message: 'is-processing' };
  }

  private async runProductImportInBackground(buffer: Buffer): Promise<void> {
    const startedAt = this.importJob.started_at;
    const runStartedMs = Date.now();
    try {
      const result = await this.importProductsFromXls(buffer);
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - runStartedMs;
      this.importJob = {
        state: 'completed',
        result,
        started_at: startedAt,
        finished_at: finishedAt,
      };
      this.logger.log(
        `Product import job completed: state=completed durationMs=${durationMs} started_at=${startedAt} finished_at=${finishedAt} ${formatProductImportResult(result)}`,
      );
      if (result.errors.length > 0) {
        this.logger.warn(
          `Product import row errors (${result.errors.length}): ${result.errors.slice(0, 5).join(' | ')}${result.errors.length > 5 ? ' | …' : ''}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - runStartedMs;
      this.logger.error(
        `Product import job failed: state=failed durationMs=${durationMs} started_at=${startedAt} finished_at=${finishedAt} error=${msg}`,
      );
      this.importJob = {
        state: 'failed',
        error: msg,
        started_at: startedAt,
        finished_at: finishedAt,
      };
    }
  }

  /** Adaption whose date range includes `todayStr` (YYYY-MM-DD): start_date <= today <= end_date. */
  async findAdaptionActiveOnCalendarDate(
    productId: number,
    todayStr: string,
  ): Promise<ProductAdaption | null> {
    return this.adaptionRepo
      .createQueryBuilder('a')
      .where('a.product_id = :pid', { pid: productId })
      .andWhere('a.start_date <= :today', { today: todayStr })
      .andWhere('(a.end_date IS NULL OR a.end_date >= :today)', {
        today: todayStr,
      })
      .getOne();
  }

  /**
   * Paginates list rows (one per adaptation, or one placeholder per product without
   * adaptations), sorted by `adaption.updated_at` descending. Products without
   * adaptations fall back to `product.updated_at`.
   */
  async findProductListWithAdaptionsPage(
    page: number,
    limit: number,
    search: string,
  ): Promise<{ data: ProductListRow[]; total: number }> {
    const skip = (page - 1) * limit;
    const trimmed = (search ?? '').trim();
    const productTable = this.productRepo.metadata.tableName;
    const adaptionTable = this.adaptionRepo.metadata.tableName;

    const searchSql = trimmed
      ? 'AND (p.item_code LIKE ? OR p.item_name LIKE ?)'
      : '';
    const searchParams = trimmed ? [`%${trimmed}%`, `%${trimmed}%`] : [];

    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT a.id
        FROM ${adaptionTable} a
        INNER JOIN ${productTable} p ON p.id = a.product_id
        WHERE 1=1 ${searchSql}
        UNION ALL
        SELECT p.id
        FROM ${productTable} p
        WHERE NOT EXISTS (
          SELECT 1 FROM ${adaptionTable} a2 WHERE a2.product_id = p.id
        )
        ${searchSql}
      ) combined_rows
    `;
    const countParams = trimmed ? [...searchParams, ...searchParams] : [];
    const countRows = await this.productRepo.query<ProductListCountRow[]>(
      countSql,
      countParams,
    );
    const total = Number(countRows[0]?.total ?? 0);
    if (total === 0) {
      return { data: [], total: 0 };
    }

    const dataSql = `
      SELECT *
      FROM (
        SELECT
          a.id AS adaption_id,
          p.id AS product_id,
          p.item_code AS item_code,
          p.item_name AS item_name,
          a.start_date AS start_date,
          a.end_date AS end_date,
          a.cost_price AS cost_price,
          a.selling_price AS selling_price,
          a.delivery_fee AS delivery_fee,
          p.tax_value AS tax_value,
          p.weight_gram AS weight_gram,
          COALESCE(a.updated_at, a.created_at) AS sort_updated_at,
          a.id AS sort_tiebreak
        FROM ${adaptionTable} a
        INNER JOIN ${productTable} p ON p.id = a.product_id
        WHERE 1=1 ${searchSql}
        UNION ALL
        SELECT
          NULL AS adaption_id,
          p.id AS product_id,
          p.item_code AS item_code,
          p.item_name AS item_name,
          NULL AS start_date,
          NULL AS end_date,
          p.cost_price AS cost_price,
          p.selling_price AS selling_price,
          p.delivery_fee AS delivery_fee,
          p.tax_value AS tax_value,
          p.weight_gram AS weight_gram,
          COALESCE(p.updated_at, p.created_at) AS sort_updated_at,
          p.id AS sort_tiebreak
        FROM ${productTable} p
        WHERE NOT EXISTS (
          SELECT 1 FROM ${adaptionTable} a2 WHERE a2.product_id = p.id
        )
        ${searchSql}
      ) list_rows
      ORDER BY sort_updated_at DESC, sort_tiebreak DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...countParams, limit, skip];
    const rawRows = await this.productRepo.query<ProductListRawRow[]>(
      dataSql,
      dataParams,
    );

    const data: ProductListRow[] = rawRows.map((row) =>
      this.mapRawProductListRow(row),
    );

    return { data, total };
  }

  private mapRawProductListRow(row: ProductListRawRow): ProductListRow {
    return {
      adaption_id: row.adaption_id == null ? null : Number(row.adaption_id),
      product_id: Number(row.product_id),
      item_code: row.item_code,
      item_name: row.item_name,
      start_date: this.toYmdOrNull(row.start_date),
      end_date: this.toYmdOrNull(row.end_date),
      cost_price: Number(row.cost_price),
      selling_price: Number(row.selling_price),
      delivery_fee: Number(row.delivery_fee),
      tax_value: Number(row.tax_value),
      weight_gram: Number(row.weight_gram),
    };
  }

  private toYmdOrNull(value: Date | string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    if (value instanceof Date) {
      return calendarDateStr(value);
    }
    return String(value).slice(0, 10);
  }

  async createFirstAdaption(
    productId: number,
    dto: CreateProductAdaptionDto,
  ): Promise<ProductAdaption> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const existing = await this.adaptionRepo.count({
      where: { product_id: productId },
    });
    if (existing > 0) {
      throw new BadRequestException(
        'Product already has adaptations; edit an existing range instead.',
      );
    }

    parseYmdOrThrow('start_date', dto.start_date);
    parseYmdOrThrow('end_date', dto.end_date);
    if (dto.start_date > dto.end_date) {
      throw new BadRequestException('start_date must be on or before end_date');
    }

    if (dto.tax_value != null) {
      await this.productRepo.update(productId, { tax_value: dto.tax_value });
    }

    return this.adaptionRepo.save({
      product_id: productId,
      start_date: calendarStrToUtcNoonDate(dto.start_date),
      end_date: calendarStrToUtcNoonDate(dto.end_date),
      cost_price: dto.cost_price,
      delivery_fee: dto.delivery_fee,
      selling_price: dto.cost_price,
    });
  }

  async patchAdaptionPrices(
    adaptionId: number,
    dto: PatchProductPricesDto,
  ): Promise<ProductAdaption> {
    const adaption = await this.adaptionRepo.findOne({
      where: { id: adaptionId },
    });
    if (!adaption) {
      throw new NotFoundException(`Product adaptation ${adaptionId} not found`);
    }

    const updatePayload: Partial<ProductAdaption> = {
      cost_price: dto.cost_price,
      delivery_fee: dto.delivery_fee,
    };
    if (dto.selling_price != null) {
      updatePayload.selling_price = dto.selling_price;
    }
    await this.adaptionRepo.update(adaptionId, updatePayload);

    if (dto.tax_value != null) {
      await this.productRepo.update(adaption.product_id, {
        tax_value: dto.tax_value,
      });
    }

    const updated = await this.adaptionRepo.findOne({
      where: { id: adaptionId },
    });
    if (!updated) {
      throw new NotFoundException(`Product adaptation ${adaptionId} not found`);
    }
    return updated;
  }

  /**
   * Imports rows from a Vietnamese product catalog .xls file.
   * Upserts `product` by `item_code` and the current month's active `product_adaption`.
   */
  async importProductsFromXls(buffer: Buffer): Promise<ProductImportResult> {
    const parseStartedMs = Date.now();
    const parsed = parseProductRowsFromXls(buffer);
    const result: ProductImportResult = {
      productsCreated: 0,
      productsUpdated: 0,
      adaptionsCreated: 0,
      adaptionsUpdated: 0,
      skipped: parsed.skipped,
      errors: [...parsed.errors],
    };

    this.logger.log(
      `Product import parse finished in ${Date.now() - parseStartedMs}ms: rows=${parsed.rows.length} skipped=${parsed.skipped} parseErrors=${parsed.errors.length}`,
    );
    if (parsed.errors.length > 0) {
      this.logger.warn(
        `Product import parse warnings: ${parsed.errors.slice(0, 5).join(' | ')}${parsed.errors.length > 5 ? ' | …' : ''}`,
      );
    }

    if (parsed.rows.length === 0) {
      this.logger.log('Product import: no product rows to upsert');
      return result;
    }

    const tz = getAppTimeZone();
    const { startStr, endStr, todayStr } = calendarMonthBoundsForDate(
      new Date(),
      tz,
    );
    const monthStartDate = calendarStrToUtcNoonDate(startStr);
    const monthEndDate = calendarStrToUtcNoonDate(endStr);
    const totalRows = parsed.rows.length;

    this.logger.log(
      `Product import upsert started: rows=${totalRows} adaptionMonth=${startStr}..${endStr} today=${todayStr}`,
    );

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      try {
        await this.upsertProductRow(row, {
          monthStartDate,
          monthEndDate,
          todayStr,
          result,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Row ${row.rowNumber}: ${msg}`);
      }

      const processed = i + 1;
      if (
        processed % PRODUCT_IMPORT_PROGRESS_LOG_INTERVAL === 0 ||
        processed === totalRows
      ) {
        this.logger.log(
          `Product import progress: ${processed}/${totalRows} rows ${formatProductImportResult(result)}`,
        );
      }
    }

    return result;
  }

  private async upsertProductRow(
    row: ProductImportRow,
    ctx: {
      monthStartDate: Date;
      monthEndDate: Date;
      todayStr: string;
      result: ProductImportResult;
    },
  ): Promise<void> {
    let product = await this.productRepo.findOne({
      where: { item_code: row.item_code },
    });

    if (product) {
      const productUpdate: Partial<Product> = {
        item_name: row.item_name,
        cost_price: row.cost_price,
        delivery_fee: row.delivery_fee,
        weight_gram: row.weight_gram,
      };
      if (row.tax_value !== undefined) {
        productUpdate.tax_value = row.tax_value;
      }
      await this.productRepo.update(product.id, productUpdate);
      ctx.result.productsUpdated++;
    } else {
      product = await this.productRepo.save({
        item_code: row.item_code,
        item_name: row.item_name,
        cost_price: row.cost_price,
        selling_price: row.selling_price,
        delivery_fee: row.delivery_fee,
        tax_value: row.tax_value ?? 0,
        weight_gram: row.weight_gram,
      });
      ctx.result.productsCreated++;
    }

    const adaption = await this.findAdaptionActiveOnCalendarDate(
      product.id,
      ctx.todayStr,
    );

    if (adaption) {
      await this.adaptionRepo.update(adaption.id, {
        cost_price: row.cost_price,
        selling_price: row.selling_price,
        delivery_fee: row.delivery_fee,
      });
      ctx.result.adaptionsUpdated++;
      return;
    }

    await this.adaptionRepo.save({
      product_id: product.id,
      start_date: ctx.monthStartDate,
      end_date: ctx.monthEndDate,
      cost_price: row.cost_price,
      selling_price: row.selling_price,
      delivery_fee: row.delivery_fee,
    });
    ctx.result.adaptionsCreated++;
  }
}
