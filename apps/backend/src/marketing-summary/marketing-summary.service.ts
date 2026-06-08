import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { OrderDetail } from '../orders/order-detail.entity';
import { Product } from '../products/product.entity';
import { ProductAdaption } from '../products/product-adaption.entity';
import { AdsAccount } from '../users/ads-account.entity';
import { User } from '../users/user.entity';
import { FacebookAdsDailyCost } from '../sync/facebook-ads-daily-cost.entity';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Multipliers / rates derived from the spec (see screenshot). */
const REVENUE_RETURN_FACTOR = 0.8; // doanh thu thực hoàn ~ 80% (returns adjustment)
const ADS_TAX_RATE = 0.1; // 10% tax of ads spend
const COST_ESTIMATE_FACTOR = 0.8; // estimated cost (some orders may be returned)
const RISK_FEE_RATE = 0.1; // 10% of total cost estimate

export interface MarketingSummaryQuery {
  marketing_user_id: number;
  start_date: string;
  end_date: string;
}

export interface MarketingSummaryProductRow {
  product_id: number;
  item_code: string;
  item_name: string;
  /** Total units of this product across the matched orders. */
  total_quantity: number;
  selling_price: number;
  cost_price: number;
  delivery_fee_per_unit: number;
  /** Product-level VAT percentage, e.g. 6.5, 8.5. */
  tax_value_pct: number;
  ads_spend: number;
  /** ads_spend * 10%. */
  tax_ads: number;
  /** total_quantity * selling_price. */
  revenue: number;
  /** revenue * 0.8 (some orders are returned). */
  revenue_estimate: number;
  /** revenue_estimate * (tax_value_pct / 100). */
  revenue_tax: number;
  /** total_quantity * cost_price. */
  total_cost: number;
  /** total_cost * 0.8 (estimated; some orders may be returned). */
  total_cost_est: number;
  /** total_cost_est * 10%. */
  risk_fee: number;
  /** total_quantity * delivery_fee_per_unit. */
  total_delivery_fee: number;
  /** ads_spend / revenue_estimate * 100. Null when revenue_estimate is 0. */
  ads_per_revenue_pct: number | null;
  /** revenue_estimate - revenue_tax - total_cost_est - risk_fee - total_delivery_fee - tax_ads. */
  profit: number;
  /** profit / revenue_estimate * 100. Null when revenue_estimate is 0. */
  profit_per_revenue_pct: number | null;
}

export interface MarketingSummaryTotals {
  total_quantity: number;
  ads_spend: number;
  tax_ads: number;
  revenue: number;
  revenue_estimate: number;
  revenue_tax: number;
  total_cost: number;
  total_cost_est: number;
  risk_fee: number;
  total_delivery_fee: number;
  profit: number;
  ads_per_revenue_pct: number | null;
  profit_per_revenue_pct: number | null;
}

/**
 * Ads-only bucket for spend that could not be attributed to any product (e.g.
 * campaign name did not match a known product code). Reported as informational
 * — it has no revenue / cost / delivery fee, and intentionally **does not
 * contribute to profit** (per spec, unmatched ads are not charged against the
 * marketing user's profit).
 */
export interface MarketingSummaryUnmatched {
  ads_spend: number;
  tax_ads: number;
}

export interface MarketingSummaryResponse {
  marketing_user_id: number;
  marketing_user_display_name: string;
  start_date: string;
  end_date: string;
  ads_account_ids: string[];
  /** Number of confirmed orders matched by the filter (total_quantity > 0). */
  total_orders: number;
  rows: MarketingSummaryProductRow[];
  unmatched: MarketingSummaryUnmatched;
  /** Combined totals across all product rows AND the unmatched bucket. */
  totals: MarketingSummaryTotals;
}

export interface MarketingSummaryAllUserEntry {
  marketing_user_id: number;
  marketing_user_display_name: string;
  ads_account_ids: string[];
  total_orders: number;
  unmatched: MarketingSummaryUnmatched;
  totals: MarketingSummaryTotals;
}

/** Per-user totals for every marketing user (no per-product breakdown). */
export interface MarketingSummaryAllResponse {
  start_date: string;
  end_date: string;
  users: MarketingSummaryAllUserEntry[];
}

@Injectable()
export class MarketingSummaryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderDetail)
    private readonly orderDetailRepo: Repository<OrderDetail>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductAdaption)
    private readonly adaptionRepo: Repository<ProductAdaption>,
    @InjectRepository(AdsAccount)
    private readonly adsAccountRepo: Repository<AdsAccount>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(FacebookAdsDailyCost)
    private readonly dailyCostRepo: Repository<FacebookAdsDailyCost>,
  ) {}

  async summarize(q: MarketingSummaryQuery): Promise<MarketingSummaryResponse> {
    const { marketing_user_id, start_date, end_date } = this.validateQuery(q);

    const marketing = await this.userRepo.findOne({
      where: { id: marketing_user_id, type: 'marketing' },
      select: ['id', 'display_name'],
    });
    if (!marketing) {
      throw new BadRequestException(
        `Marketing user ${marketing_user_id} not found`,
      );
    }

    const orders = await this.findConfirmedOrders(
      marketing_user_id,
      start_date,
      end_date,
    );
    const totalProductQuantity = await this.computeProductQuantities(orders);

    const adsAccounts = await this.adsAccountRepo.find({
      where: { user_id: marketing_user_id },
      select: ['ad_account_id'],
    });
    const adsAccountIds = adsAccounts.map((a) => a.ad_account_id);

    const productIds = Array.from(totalProductQuantity.keys());
    const adsSpendByProduct = await this.computeAdsSpend(
      productIds,
      adsAccountIds,
      start_date,
      end_date,
    );
    const productMap = await this.fetchProducts(productIds);
    const adaptionMap = await this.fetchActiveAdaptions(productIds, end_date);

    const rows = this.buildRows(
      productIds,
      productMap,
      adaptionMap,
      totalProductQuantity,
      adsSpendByProduct,
    );

    rows.sort((a, b) => b.revenue_estimate - a.revenue_estimate);

    const unmatched = await this.computeUnmatchedAds(
      adsAccountIds,
      start_date,
      end_date,
    );

    return {
      marketing_user_id,
      marketing_user_display_name: marketing.display_name,
      start_date,
      end_date,
      ads_account_ids: adsAccountIds,
      total_orders: orders.length,
      rows,
      unmatched,
      totals: this.computeTotals(rows, unmatched),
    };
  }

  /**
   * Returns the combined (TỔNG CỘNG) totals for every marketing user — one
   * entry per user, without per-product rows.
   */
  async summarizeAll(
    start_date: string,
    end_date: string,
  ): Promise<MarketingSummaryAllResponse> {
    const { start_date: start, end_date: end } = this.validateDateRange(
      start_date,
      end_date,
    );

    const marketers = await this.userRepo.find({
      where: { type: 'marketing' },
      select: ['id', 'display_name'],
      order: { display_name: 'ASC' },
    });

    const users = await Promise.all(
      marketers.map(async (m) => {
        const summary = await this.summarize({
          marketing_user_id: m.id,
          start_date: start,
          end_date: end,
        });
        return {
          marketing_user_id: summary.marketing_user_id,
          marketing_user_display_name: summary.marketing_user_display_name,
          ads_account_ids: summary.ads_account_ids,
          total_orders: summary.total_orders,
          unmatched: summary.unmatched,
          totals: summary.totals,
        };
      }),
    );

    users.sort((a, b) => b.totals.profit - a.totals.profit);

    return { start_date: start, end_date: end, users };
  }

  private validateQuery(q: MarketingSummaryQuery): MarketingSummaryQuery {
    const marketing_user_id = Number(q.marketing_user_id);
    if (!Number.isFinite(marketing_user_id) || marketing_user_id <= 0) {
      throw new BadRequestException(
        'marketing_user_id must be a positive integer',
      );
    }
    const { start_date, end_date } = this.validateDateRange(
      q.start_date,
      q.end_date,
    );
    return { marketing_user_id, start_date, end_date };
  }

  private validateDateRange(
    startDate: string,
    endDate: string,
  ): { start_date: string; end_date: string } {
    const start = String(startDate || '').trim();
    const end = String(endDate || '').trim() || start;
    if (!YMD_RE.test(start)) {
      throw new BadRequestException('start_date must be YYYY-MM-DD');
    }
    if (!YMD_RE.test(end)) {
      throw new BadRequestException('end_date must be YYYY-MM-DD');
    }
    if (start > end) {
      throw new BadRequestException('start_date must be on or before end_date');
    }
    return { start_date: start, end_date: end };
  }

  /**
   * Confirmed orders for the marketing user where the date prefix of `confirm_time`
   * is within [start_date, end_date]. Uses SUBSTRING to handle both
   * `YYYY-MM-DD HH:MM:SS` and `YYYY-MM-DDTHH:MM:SS...` storage formats.
   */
  private async findConfirmedOrders(
    marketingUserId: number,
    startDate: string,
    endDate: string,
  ): Promise<Order[]> {
    return this.orderRepo
      .createQueryBuilder('o')
      .where('o.marketing_user_id = :uid', { uid: marketingUserId })
      .andWhere('o.total_quantity > 0')
      .andWhere('o.confirm_time IS NOT NULL')
      .andWhere(
        'SUBSTRING(o.confirm_time, 1, 10) BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      )
      .getMany();
  }

  /**
   * Builds `{ product_id -> total_quantity }` from the list of orders.
   * - Single-product orders: add `order.total_quantity` to that product.
   * - Multi-product orders: sum quantities from `order_details`, mapping
   *   `item_code` to `product_id`.
   */
  private async computeProductQuantities(
    orders: Order[],
  ): Promise<Map<number, number>> {
    const totals = new Map<number, number>();
    const multiOrderIds: number[] = [];

    for (const order of orders) {
      const productIds = (order.product_ids || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      const uniqueProductIds = Array.from(new Set(productIds));
      if (uniqueProductIds.length === 0) {
        continue;
      }
      if (uniqueProductIds.length === 1) {
        const pid = uniqueProductIds[0];
        const qty = Number(order.total_quantity || 0);
        if (qty > 0) {
          totals.set(pid, (totals.get(pid) ?? 0) + qty);
        }
      } else {
        multiOrderIds.push(order.id);
      }
    }

    if (multiOrderIds.length === 0) {
      return totals;
    }

    const details = await this.orderDetailRepo
      .createQueryBuilder('od')
      .where('od.order_id IN (:...ids)', { ids: multiOrderIds })
      .getMany();

    const codes = Array.from(
      new Set(details.map((d) => d.item_code).filter((c): c is string => !!c)),
    );
    const codeToProductId = new Map<string, number>();
    if (codes.length > 0) {
      const products = await this.productRepo.find({
        where: { item_code: In(codes) },
        select: ['id', 'item_code'],
      });
      for (const p of products) {
        codeToProductId.set(p.item_code, p.id);
      }
    }

    for (const detail of details) {
      const pid = codeToProductId.get(detail.item_code);
      if (pid == null) continue;
      const qty = Number(detail.quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      totals.set(pid, (totals.get(pid) ?? 0) + qty);
    }

    return totals;
  }

  /**
   * Sum of `facebook_ads_daily_cost.spend` over the user's ads accounts in
   * `[startDate, endDate]` whose `product_id IS NULL` — i.e. spend that the
   * sync could not attribute to any known product.
   */
  private async computeUnmatchedAds(
    adsAccountIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<MarketingSummaryUnmatched> {
    if (adsAccountIds.length === 0) {
      return { ads_spend: 0, tax_ads: 0 };
    }
    const raw = await this.dailyCostRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.spend), 0)', 'total')
      .where('c.ad_account_id IN (:...aids)', { aids: adsAccountIds })
      .andWhere('c.product_id IS NULL')
      .andWhere('c.sync_date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getRawOne<{ total: string | number }>();
    const adsSpend = Number(raw?.total ?? 0);
    return {
      ads_spend: adsSpend,
      tax_ads: adsSpend * ADS_TAX_RATE,
    };
  }

  private async computeAdsSpend(
    productIds: number[],
    adsAccountIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<number, number>> {
    const spend = new Map<number, number>();
    if (productIds.length === 0 || adsAccountIds.length === 0) {
      return spend;
    }

    const costs = await this.dailyCostRepo
      .createQueryBuilder('c')
      .where('c.ad_account_id IN (:...aids)', { aids: adsAccountIds })
      .andWhere('c.product_id IN (:...pids)', { pids: productIds })
      .andWhere('c.sync_date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .getMany();

    for (const c of costs) {
      if (c.product_id == null) continue;
      const prev = spend.get(c.product_id) ?? 0;
      spend.set(c.product_id, prev + Number(c.spend || 0));
    }
    return spend;
  }

  private async fetchProducts(
    productIds: number[],
  ): Promise<Map<number, Product>> {
    const map = new Map<number, Product>();
    if (productIds.length === 0) return map;
    const products = await this.productRepo.find({
      where: { id: In(productIds) },
    });
    for (const p of products) map.set(p.id, p);
    return map;
  }

  /**
   * Adaptation active on `endDate` per product (start_date <= endDate <= end_date,
   * or end_date IS NULL). When the user picked a range we use the most recent
   * end of the range — this is a single-row simplification consistent with the
   * spec ("Revenue = Total_product_orders * product_adaption.selling_price").
   */
  private async fetchActiveAdaptions(
    productIds: number[],
    endDate: string,
  ): Promise<Map<number, ProductAdaption>> {
    const map = new Map<number, ProductAdaption>();
    if (productIds.length === 0) return map;
    const adaptions = await this.adaptionRepo
      .createQueryBuilder('a')
      .where('a.product_id IN (:...pids)', { pids: productIds })
      .andWhere('a.start_date <= :today', { today: endDate })
      .andWhere('(a.end_date IS NULL OR a.end_date >= :today)', {
        today: endDate,
      })
      .getMany();
    for (const a of adaptions) {
      // If somehow multiple match (shouldn't happen), keep the last seen.
      map.set(a.product_id, a);
    }
    return map;
  }

  private buildRows(
    productIds: number[],
    productMap: Map<number, Product>,
    adaptionMap: Map<number, ProductAdaption>,
    quantityByProduct: Map<number, number>,
    adsSpendByProduct: Map<number, number>,
  ): MarketingSummaryProductRow[] {
    const rows: MarketingSummaryProductRow[] = [];
    for (const pid of productIds) {
      const product = productMap.get(pid);
      if (!product) {
        continue;
      }
      const adaption = adaptionMap.get(pid);

      const sellingPrice = Number(
        adaption?.selling_price ?? product.selling_price ?? 0,
      );
      const costPrice = Number(adaption?.cost_price ?? product.cost_price ?? 0);
      const deliveryFeePerUnit = Number(
        adaption?.delivery_fee ?? product.delivery_fee ?? 0,
      );
      const taxValuePct = Number(product.tax_value || 0);

      const qty = quantityByProduct.get(pid) ?? 0;
      const adsSpend = adsSpendByProduct.get(pid) ?? 0;

      const taxAds = adsSpend * ADS_TAX_RATE;
      const revenue = qty * sellingPrice;
      const revenueEstimate = revenue * REVENUE_RETURN_FACTOR;
      const revenueTax = revenueEstimate * (taxValuePct / 100);
      const totalCost = qty * costPrice;
      const totalCostEst = totalCost * COST_ESTIMATE_FACTOR;
      const riskFee = totalCostEst * RISK_FEE_RATE;
      const totalDeliveryFee = qty * deliveryFeePerUnit;

      const profit =
        revenueEstimate -
        (revenueTax + taxAds + totalCostEst + riskFee + totalDeliveryFee);

      const adsPerRevenuePct =
        revenueEstimate > 0 ? (adsSpend / revenueEstimate) * 100 : null;
      const profitPerRevenuePct =
        revenueEstimate > 0 ? (profit / revenueEstimate) * 100 : null;

      rows.push({
        product_id: pid,
        item_code: product.item_code,
        item_name: product.item_name,
        total_quantity: qty,
        selling_price: sellingPrice,
        cost_price: costPrice,
        delivery_fee_per_unit: deliveryFeePerUnit,
        tax_value_pct: taxValuePct,
        ads_spend: adsSpend,
        tax_ads: taxAds,
        revenue,
        revenue_estimate: revenueEstimate,
        revenue_tax: revenueTax,
        total_cost: totalCost,
        total_cost_est: totalCostEst,
        risk_fee: riskFee,
        total_delivery_fee: totalDeliveryFee,
        ads_per_revenue_pct: adsPerRevenuePct,
        profit,
        profit_per_revenue_pct: profitPerRevenuePct,
      });
    }
    return rows;
  }

  private computeTotals(
    rows: MarketingSummaryProductRow[],
    unmatched: MarketingSummaryUnmatched,
  ): MarketingSummaryTotals {
    const sumKey = (
      key: keyof Pick<
        MarketingSummaryProductRow,
        | 'total_quantity'
        | 'ads_spend'
        | 'tax_ads'
        | 'revenue'
        | 'revenue_estimate'
        | 'revenue_tax'
        | 'total_cost'
        | 'total_cost_est'
        | 'risk_fee'
        | 'total_delivery_fee'
        | 'profit'
      >,
    ) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    // Unmatched contributes only to ads-spend / tax-ads totals (informational).
    // It is intentionally excluded from profit per spec — only product rows
    // contribute to total profit.
    const adsSpend = sumKey('ads_spend') + unmatched.ads_spend;
    const taxAds = sumKey('tax_ads') + unmatched.tax_ads;
    const revenueEstimate = sumKey('revenue_estimate');
    const profit = sumKey('profit');

    return {
      total_quantity: sumKey('total_quantity'),
      ads_spend: adsSpend,
      tax_ads: taxAds,
      revenue: sumKey('revenue'),
      revenue_estimate: revenueEstimate,
      revenue_tax: sumKey('revenue_tax'),
      total_cost: sumKey('total_cost'),
      total_cost_est: sumKey('total_cost_est'),
      risk_fee: sumKey('risk_fee'),
      total_delivery_fee: sumKey('total_delivery_fee'),
      profit,
      ads_per_revenue_pct:
        revenueEstimate > 0 ? (adsSpend / revenueEstimate) * 100 : null,
      profit_per_revenue_pct:
        revenueEstimate > 0 ? (profit / revenueEstimate) * 100 : null,
    };
  }
}
