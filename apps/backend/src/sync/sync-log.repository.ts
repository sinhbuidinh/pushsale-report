import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../common/base.repository';
import { SyncLog } from './sync-log.entity';

@Injectable()
export class SyncLogRepository extends BaseRepository<SyncLog> {
  constructor(private dataSource: DataSource) {
    super(SyncLog, dataSource.createEntityManager());
  }
}
