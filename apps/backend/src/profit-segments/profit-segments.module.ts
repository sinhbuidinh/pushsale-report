import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoasSettings } from './poas-settings.entity';
import { ProfitSegment } from './profit-segment.entity';
import { ProfitSegmentsController } from './profit-segments.controller';
import { ProfitSegmentsService } from './profit-segments.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfitSegment, PoasSettings])],
  controllers: [ProfitSegmentsController],
  providers: [ProfitSegmentsService],
  exports: [ProfitSegmentsService],
})
export class ProfitSegmentsModule {}
