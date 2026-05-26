import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { AdminGuard } from '../auth/admin.guard';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';

interface ResetPasswordBody {
  newPassword: string;
}

const MIN_PASSWORD_LENGTH = 6;

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly authService: AuthService,
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

  /**
   * Full user list (admin only) — never exposes password hashes.
   */
  @Get()
  @UseGuards(AdminGuard)
  async listAll() {
    try {
      const users = await this.userRepo.find({
        order: { type: 'ASC', display_name: 'ASC' },
        select: [
          'id',
          'username',
          'display_name',
          'type',
          'created_at',
          'updated_at',
        ],
      });
      return { status: true, data: users };
    } catch (error) {
      return { status: false, error: httpErrorMessage(error) };
    }
  }

  /**
   * Admin-only: set a temporary password for any user. The target user can
   * then sign in and change it themselves via /auth/change-password.
   */
  @Post(':id/reset-password')
  @UseGuards(AdminGuard)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetPasswordBody,
  ) {
    try {
      const newPassword = String(body?.newPassword ?? '');
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new BadRequestException(
          `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
      }
      const target = await this.userRepo.findOne({ where: { id } });
      if (!target) {
        throw new NotFoundException(`User ${id} not found.`);
      }
      await this.authService.updatePassword(id, newPassword);
      return {
        status: true,
        data: {
          id: target.id,
          username: target.username,
          display_name: target.display_name,
          type: target.type,
        },
      };
    } catch (error) {
      return { status: false, error: httpErrorMessage(error) };
    }
  }
}
