import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Marketing and sale users for order list filters (no passwords).
   */
  @Get('order-filters')
  async orderFilterLists() {
    try {
      const marketing = await this.userRepo.find({
        where: { type: 'marketing' },
        order: { display_name: 'ASC' },
        select: ['id', 'display_name'],
      });
      const sale = await this.userRepo.find({
        where: { type: 'sale' },
        order: { display_name: 'ASC' },
        select: ['id', 'display_name'],
      });
      return {
        status: true,
        data: { marketing, sale },
      };
    } catch (error) {
      return {
        status: false,
        error: (error as Error).message,
      };
    }
  }
}
