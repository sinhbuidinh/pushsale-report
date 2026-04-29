import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Product } from './product.entity';
import { ProductAdaption } from './product-adaption.entity';

export interface PatchProductPricesDto {
  cost_price: number;
  delivery_fee: number;
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
  delivery_fee: number;
  weight_gram: number;
}

export interface CreateProductAdaptionDto {
  start_date: string;
  end_date: string;
  cost_price: number;
  delivery_fee: number;
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
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductAdaption)
    private readonly adaptionRepo: Repository<ProductAdaption>,
  ) {}

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
   * Paginates by **product** (search on item_code / item_name).
   * Each product yields one row per adaptation, or a single row with `adaption_id: null` and
   * prices from `product` when there are no adaptations yet.
   */
  async findProductListWithAdaptionsPage(
    page: number,
    limit: number,
    search: string,
  ): Promise<{ data: ProductListRow[]; total: number }> {
    const skip = (page - 1) * limit;
    const trimmed = (search ?? '').trim();

    const where = trimmed
      ? [
          { item_code: Like(`%${trimmed}%`) },
          { item_name: Like(`%${trimmed}%`) },
        ]
      : {};

    const [products, total] = await this.productRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take: limit,
    });

    if (products.length === 0) {
      return { data: [], total };
    }

    const ids = products.map((p) => p.id);
    const adaptions = await this.adaptionRepo
      .createQueryBuilder('a')
      .where('a.product_id IN (:...ids)', { ids })
      .orderBy('a.start_date', 'ASC')
      .addOrderBy('a.id', 'ASC')
      .getMany();

    const byProduct = new Map<number, ProductAdaption[]>();
    for (const a of adaptions) {
      const list = byProduct.get(a.product_id) ?? [];
      list.push(a);
      byProduct.set(a.product_id, list);
    }

    const mapAdaptionDates = (a: ProductAdaption) => {
      const sd = a.start_date as unknown as Date | string;
      const ed = a.end_date as unknown as Date | string | null;
      const startStr =
        sd instanceof Date ? calendarDateStr(sd) : String(sd).slice(0, 10);
      const endStr =
        ed == null
          ? null
          : ed instanceof Date
            ? calendarDateStr(ed)
            : String(ed).slice(0, 10);
      return { startStr, endStr };
    };

    const data: ProductListRow[] = [];
    for (const p of products) {
      const list = byProduct.get(p.id) ?? [];
      if (list.length === 0) {
        data.push({
          adaption_id: null,
          product_id: p.id,
          item_code: p.item_code,
          item_name: p.item_name,
          start_date: null,
          end_date: null,
          cost_price: Number(p.cost_price),
          delivery_fee: Number(p.delivery_fee),
          weight_gram: p.weight_gram,
        });
      } else {
        for (const a of list) {
          const { startStr, endStr } = mapAdaptionDates(a);
          data.push({
            adaption_id: a.id,
            product_id: p.id,
            item_code: p.item_code,
            item_name: p.item_name,
            start_date: startStr,
            end_date: endStr,
            cost_price: Number(a.cost_price),
            delivery_fee: Number(a.delivery_fee),
            weight_gram: p.weight_gram,
          });
        }
      }
    }

    return { data, total };
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

    await this.adaptionRepo.update(adaptionId, {
      cost_price: dto.cost_price,
      delivery_fee: dto.delivery_fee,
    });

    const updated = await this.adaptionRepo.findOne({
      where: { id: adaptionId },
    });
    if (!updated) {
      throw new NotFoundException(`Product adaptation ${adaptionId} not found`);
    }
    return updated;
  }
}
