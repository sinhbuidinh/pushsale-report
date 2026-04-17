import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HttpRetryService } from './http-retry.service';

@Module({
  imports: [HttpModule],
  providers: [HttpRetryService],
  exports: [HttpModule, HttpRetryService],
})
export class CommonModule {}
