import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';
import {
  ProfitSegmentsService,
  UpdateProfitSegmentDto,
} from './profit-segments.service';

@Controller('profit-segments')
@UseGuards(JwtAuthGuard)
export class ProfitSegmentsController {
  constructor(private readonly service: ProfitSegmentsService) {}

  /** Lists all configured segments in display order. */
  @Get()
  async list() {
    try {
      const data = await this.service.findAll();
      return { status: true, data };
    } catch (error) {
      return { status: false, error: httpErrorMessage(error) };
    }
  }

  /** Updates one segment's price window and/or thresholds. */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const dto = this.coerceUpdateDto(body);
      const data = await this.service.update(id, dto);
      return { status: true, data };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        return { status: false, error: error.message };
      }
      return { status: false, error: httpErrorMessage(error) };
    }
  }

  /** Resets all three default segments to their factory threshold values. */
  @Post('reset-defaults')
  async resetDefaults() {
    try {
      const data = await this.service.resetToDefaults();
      return { status: true, data };
    } catch (error) {
      return { status: false, error: httpErrorMessage(error) };
    }
  }

  private coerceUpdateDto(body: Record<string, unknown>): UpdateProfitSegmentDto {
    const dto: UpdateProfitSegmentDto = {};
    if (typeof body.name === 'string') {
      dto.name = body.name;
    }
    if (body.min_price_vnd !== undefined) {
      dto.min_price_vnd = this.toNumber('min_price_vnd', body.min_price_vnd);
    }
    if (body.max_price_vnd !== undefined) {
      dto.max_price_vnd =
        body.max_price_vnd === null || body.max_price_vnd === ''
          ? null
          : this.toNumber('max_price_vnd', body.max_price_vnd);
    }
    if (body.danger_max_pct !== undefined) {
      dto.danger_max_pct = this.toNumber('danger_max_pct', body.danger_max_pct);
    }
    if (body.warning_max_pct !== undefined) {
      dto.warning_max_pct = this.toNumber(
        'warning_max_pct',
        body.warning_max_pct,
      );
    }
    if (body.good_max_pct !== undefined) {
      dto.good_max_pct = this.toNumber('good_max_pct', body.good_max_pct);
    }
    return dto;
  }

  private toNumber(label: string, raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${label} must be a number`);
    }
    return n;
  }
}
