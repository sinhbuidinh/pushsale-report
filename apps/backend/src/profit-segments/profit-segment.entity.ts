import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';

/**
 * Single row per price segment used to colour-code marketing performance.
 *
 * Each segment defines an inclusive `min_price_vnd` and exclusive `max_price_vnd`
 * window (VND, applied against the product selling price) and three threshold
 * percentages applied to `% Profit / Revenue`:
 *   - `< danger_max_pct`              → 🔴 Danger
 *   - `[danger_max_pct, warning_max_pct)` → 🟡 Warning
 *   - `[warning_max_pct, good_max_pct)`   → 🔵 Good
 *   - `>= good_max_pct`               → 🟢 Excellent
 *
 * `code` is a stable identifier used by the frontend and seeder (`low` /
 * `medium` / `high`). `sort_order` controls display order on the settings page.
 */
@Entity()
export class ProfitSegment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  @Column({ length: 128 })
  name: string;

  /** Inclusive lower bound of the selling price window, in VND. */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  min_price_vnd: number;

  /**
   * Exclusive upper bound, in VND. `null` means "open-ended" (no upper limit),
   * useful if an admin wants to extend the highest segment.
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  max_price_vnd: number | null;

  /** Upper bound (exclusive) of the Danger band, as a % (e.g. 15.00). */
  @Column({ type: 'decimal', precision: 6, scale: 2 })
  danger_max_pct: number;

  /** Upper bound (exclusive) of the Warning band, as a %. */
  @Column({ type: 'decimal', precision: 6, scale: 2 })
  warning_max_pct: number;

  /** Upper bound (exclusive) of the Good band, as a %. Above → Excellent. */
  @Column({ type: 'decimal', precision: 6, scale: 2 })
  good_max_pct: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
