import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
  ) {}

  @Get()
  async findAll() {
    try {
      const data = await this.customerRepo.find();
      return {
        status: true,
        data: data,
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
      };
    }
  }
}
