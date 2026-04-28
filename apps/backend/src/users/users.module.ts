import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Customer } from './customer.entity';
import { CustomersController } from './customers.controller';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Customer])],
  controllers: [CustomersController, UsersController],
})
export class UsersModule {}
