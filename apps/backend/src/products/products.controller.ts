import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
  ) {
    try {
      const { data, total } =
        await this.productsService.findProductListWithAdaptionsPage(
          Number(page) || 1,
          Number(limit) || 10,
          search ?? '',
        );

      return {
        status: true,
        data: {
          data,
          total,
          page: Number(page) || 1,
          limit: Number(limit) || 10,
        },
      };
    } catch (error) {
      return {
        status: false,
        error: (error as Error).message,
      };
    }
  }

  @Get('import/status')
  getImportStatus() {
    const data = this.productsService.getProductImportStatus();
    return { status: true, data };
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importProducts(
    @UploadedFile() file?: { buffer: Buffer; originalname?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required (.xls)');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      throw new BadRequestException('Only .xls or .xlsx files are supported');
    }
    const { message } = this.productsService.startProductImportFromXls(
      file.buffer,
    );
    return { status: true, message };
  }

  @Post(':productId/adaptions')
  async createFirstAdaption(
    @Param('productId', ParseIntPipe) productId: number,
    @Body()
    body: {
      start_date?: unknown;
      end_date?: unknown;
      cost_price?: unknown;
      delivery_fee?: unknown;
      tax_value?: unknown;
    },
  ) {
    const start_date =
      typeof body.start_date === 'string' ? body.start_date.trim() : '';
    const end_date =
      typeof body.end_date === 'string' ? body.end_date.trim() : '';
    const cost_price = Number(body.cost_price);
    const delivery_fee = Number(body.delivery_fee);
    if (!start_date || !end_date) {
      throw new BadRequestException('start_date and end_date are required');
    }
    if (!Number.isFinite(cost_price) || cost_price < 0) {
      throw new BadRequestException('cost_price must be a non-negative number');
    }
    if (!Number.isFinite(delivery_fee) || delivery_fee < 0) {
      throw new BadRequestException(
        'delivery_fee must be a non-negative number',
      );
    }
    const tax_value = parseOptionalTaxValue(body.tax_value);
    try {
      const data = await this.productsService.createFirstAdaption(productId, {
        start_date,
        end_date,
        cost_price,
        delivery_fee,
        tax_value,
      });
      return { status: true, data };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        return { status: false, error: error.message };
      }
      return { status: false, error: (error as Error).message };
    }
  }

  @Patch('adaptions/:adaptionId')
  async patchAdaptionPrices(
    @Param('adaptionId', ParseIntPipe) adaptionId: number,
    @Body()
    body: {
      cost_price?: unknown;
      delivery_fee?: unknown;
      selling_price?: unknown;
      tax_value?: unknown;
    },
  ) {
    const cost_price = Number(body.cost_price);
    const delivery_fee = Number(body.delivery_fee);
    if (!Number.isFinite(cost_price) || cost_price < 0) {
      throw new BadRequestException('cost_price must be a non-negative number');
    }
    if (!Number.isFinite(delivery_fee) || delivery_fee < 0) {
      throw new BadRequestException(
        'delivery_fee must be a non-negative number',
      );
    }
    let selling_price: number | undefined;
    if (body.selling_price != null && body.selling_price !== '') {
      const parsed = Number(body.selling_price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new BadRequestException(
          'selling_price must be a non-negative number',
        );
      }
      selling_price = parsed;
    }
    const tax_value = parseOptionalTaxValue(body.tax_value);
    try {
      const data = await this.productsService.patchAdaptionPrices(adaptionId, {
        cost_price,
        delivery_fee,
        selling_price,
        tax_value,
      });
      return { status: true, data };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { status: false, error: error.message };
      }
      return { status: false, error: (error as Error).message };
    }
  }
}

function parseOptionalTaxValue(raw: unknown): number | undefined {
  if (raw == null || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException(
      'tax_value must be a non-negative number (e.g. 6.5)',
    );
  }
  return parsed;
}
