import { Column } from 'typeorm';

/** Nullable `created_at`, DB default CURRENT_TIMESTAMP. */
export const EntityCreatedAtColumn = () =>
  Column({
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  });

/** Nullable `updated_at`, DB default + ON UPDATE CURRENT_TIMESTAMP. */
export const EntityUpdatedAtColumn = () =>
  Column({
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  });
