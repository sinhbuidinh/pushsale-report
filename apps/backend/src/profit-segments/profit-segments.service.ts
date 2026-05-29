import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfitSegment } from './profit-segment.entity';

export interface ProfitSegmentDto {
  id: number;
  code: string;
  name: string;
  min_price_vnd: number;
  max_price_vnd: number | null;
  danger_max_pct: number;
  warning_max_pct: number;
  good_max_pct: number;
  sort_order: number;
}

export interface UpdateProfitSegmentDto {
  name?: string;
  min_price_vnd?: number;
  max_price_vnd?: number | null;
  danger_max_pct?: number;
  warning_max_pct?: number;
  good_max_pct?: number;
}

interface SeedSpec {
  code: string;
  name: string;
  min_price_vnd: number;
  max_price_vnd: number | null;
  danger_max_pct: number;
  warning_max_pct: number;
  good_max_pct: number;
  sort_order: number;
}

/**
 * Default segments seeded on first boot. The numeric thresholds match the
 * product spec ("Sản phẩm Giá rẻ / Trung bình / Cao") and can be tuned later
 * from the settings page without code changes.
 */
const DEFAULT_SEGMENTS: SeedSpec[] = [
  {
    code: 'low',
    name: 'Sản phẩm Giá rẻ (20k - dưới 200k)',
    min_price_vnd: 20_000,
    max_price_vnd: 200_000,
    danger_max_pct: 15,
    warning_max_pct: 30,
    good_max_pct: 45,
    sort_order: 1,
  },
  {
    code: 'medium',
    name: 'Sản phẩm Trung bình (200k - dưới 700k)',
    min_price_vnd: 200_000,
    max_price_vnd: 700_000,
    danger_max_pct: 5,
    warning_max_pct: 15,
    good_max_pct: 30,
    sort_order: 2,
  },
  {
    code: 'high',
    name: 'Sản phẩm Giá cao (700k - 1tr7 VND)',
    min_price_vnd: 700_000,
    max_price_vnd: 1_700_000,
    danger_max_pct: 0,
    warning_max_pct: 10,
    good_max_pct: 20,
    sort_order: 3,
  },
];

const toDto = (e: ProfitSegment): ProfitSegmentDto => ({
  id: e.id,
  code: e.code,
  name: e.name,
  min_price_vnd: Number(e.min_price_vnd),
  max_price_vnd: e.max_price_vnd == null ? null : Number(e.max_price_vnd),
  danger_max_pct: Number(e.danger_max_pct),
  warning_max_pct: Number(e.warning_max_pct),
  good_max_pct: Number(e.good_max_pct),
  sort_order: e.sort_order,
});

@Injectable()
export class ProfitSegmentsService implements OnModuleInit {
  private readonly logger = new Logger(ProfitSegmentsService.name);

  constructor(
    @InjectRepository(ProfitSegment)
    private readonly repo: Repository<ProfitSegment>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultsIfMissing();
  }

  /** Inserts any missing default segments (idempotent, never overwrites). */
  async seedDefaultsIfMissing(): Promise<void> {
    for (const spec of DEFAULT_SEGMENTS) {
      const existing = await this.repo.findOne({ where: { code: spec.code } });
      if (existing) continue;
      await this.repo.save(this.repo.create(spec));
      this.logger.log(`Seeded default profit segment "${spec.code}"`);
    }
  }

  async findAll(): Promise<ProfitSegmentDto[]> {
    const rows = await this.repo.find({
      order: { sort_order: 'ASC', id: 'ASC' },
    });
    return rows.map(toDto);
  }

  async update(
    id: number,
    dto: UpdateProfitSegmentDto,
  ): Promise<ProfitSegmentDto> {
    const segment = await this.repo.findOne({ where: { id } });
    if (!segment) {
      throw new NotFoundException(`Profit segment ${id} not found`);
    }

    const minPrice =
      dto.min_price_vnd != null
        ? this.assertNonNegative('min_price_vnd', dto.min_price_vnd)
        : Number(segment.min_price_vnd);

    const maxPrice =
      dto.max_price_vnd === undefined
        ? segment.max_price_vnd == null
          ? null
          : Number(segment.max_price_vnd)
        : dto.max_price_vnd === null
          ? null
          : this.assertNonNegative('max_price_vnd', dto.max_price_vnd);

    if (maxPrice != null && minPrice > maxPrice) {
      throw new BadRequestException(
        'min_price_vnd must be <= max_price_vnd (or set max to null for open-ended)',
      );
    }

    const danger =
      dto.danger_max_pct != null
        ? this.assertPct('danger_max_pct', dto.danger_max_pct)
        : Number(segment.danger_max_pct);
    const warning =
      dto.warning_max_pct != null
        ? this.assertPct('warning_max_pct', dto.warning_max_pct)
        : Number(segment.warning_max_pct);
    const good =
      dto.good_max_pct != null
        ? this.assertPct('good_max_pct', dto.good_max_pct)
        : Number(segment.good_max_pct);

    if (!(danger <= warning && warning <= good)) {
      throw new BadRequestException(
        'Thresholds must satisfy danger_max_pct <= warning_max_pct <= good_max_pct',
      );
    }

    await this.repo.update(id, {
      name: dto.name?.trim() || segment.name,
      min_price_vnd: minPrice,
      max_price_vnd: maxPrice,
      danger_max_pct: danger,
      warning_max_pct: warning,
      good_max_pct: good,
    });

    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) {
      throw new NotFoundException(`Profit segment ${id} not found`);
    }
    return toDto(updated);
  }

  /** Restores the three default segments to their initial threshold values. */
  async resetToDefaults(): Promise<ProfitSegmentDto[]> {
    for (const spec of DEFAULT_SEGMENTS) {
      const existing = await this.repo.findOne({ where: { code: spec.code } });
      if (existing) {
        await this.repo.update(existing.id, spec);
      } else {
        await this.repo.save(this.repo.create(spec));
      }
    }
    return this.findAll();
  }

  private assertNonNegative(label: string, raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException(`${label} must be a non-negative number`);
    }
    return n;
  }

  private assertPct(label: string, raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${label} must be a number`);
    }
    if (n < -100 || n > 100) {
      throw new BadRequestException(`${label} must be between -100 and 100`);
    }
    return n;
  }
}
