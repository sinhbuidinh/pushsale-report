import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SyncStatus } from '@sync-project/shared';
import { BaseRepository } from '../common/base.repository';
import { SyncLog } from './sync-log.entity';

const PUSHSALE_PAGE_SIZE = 100;

function recordCountFromLog(log: SyncLog): number {
  const data = log.data as { records?: number } | null;
  if (data?.records != null && Number.isFinite(data.records)) {
    return data.records;
  }
  return log.synced_count ?? 0;
}

@Injectable()
export class SyncLogRepository extends BaseRepository<SyncLog> {
  constructor(private dataSource: DataSource) {
    super(SyncLog, dataSource.createEntityManager());
  }

  /**
   * A PushSale day is complete when we have a successful terminal page
   * (&lt; page size records) or a legacy run-level success row (no page_no).
   */
  async findCompletedOrderSyncForDate(
    syncDate: string,
  ): Promise<SyncLog | null> {
    const successes = await this.find({
      where: { sync_date: syncDate, status: SyncStatus.Success },
      order: { page_no: 'DESC', id: 'DESC' },
    });

    if (successes.length === 0) {
      return null;
    }

    const legacy = successes.find((log) => log.page_no == null);
    if (legacy) {
      return legacy;
    }

    return (
      successes.find(
        (log) =>
          log.page_no != null && recordCountFromLog(log) < PUSHSALE_PAGE_SIZE,
      ) ?? null
    );
  }
}
