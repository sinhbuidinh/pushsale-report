import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { AdsAccount } from './ads-account.entity';
import { Customer } from './customer.entity';
import { CustomersController } from './customers.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Customer, AdsAccount])],
  controllers: [CustomersController, UsersController],
})
export class UsersModule {}
