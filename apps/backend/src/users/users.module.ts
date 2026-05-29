import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { AdsAccount } from './ads-account.entity';
import { Customer } from './customer.entity';
import { CustomersController } from './customers.controller';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Customer, AdsAccount]), AuthModule],
  controllers: [CustomersController, UsersController],
})
export class UsersModule {}
