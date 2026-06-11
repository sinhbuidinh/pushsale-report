import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  EntityCreatedAtColumn,
  EntityUpdatedAtColumn,
} from '../common/entity-timestamps';

/**
 * Singleton row holding global POAS ratio thresholds for colour-coding.
 *
 * Band semantics (same four bands as ROS segments):
 *   - `< danger_max`                    → 🔴 Danger
 *   - `[danger_max, warning_max)`       → 🟡 Warning
 *   - `[warning_max, good_max)`         → 🔵 Good
 *   - `>= good_max`                     → 🟢 Excellent
 */
@Entity()
export class PoasSettings {
  @PrimaryGeneratedColumn()
  id: number;

  /** Upper bound (exclusive) of the Danger band (e.g. 1.10). */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1.1 })
  danger_max: number;

  /** Upper bound (exclusive) of the Warning band (e.g. 1.50). */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 1.5 })
  warning_max: number;

  /** Upper bound (exclusive) of the Good band; above → Excellent (e.g. 2.20). */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 2.2 })
  good_max: number;

  @EntityCreatedAtColumn()
  created_at: Date | null;

  @EntityUpdatedAtColumn()
  updated_at: Date | null;
}
