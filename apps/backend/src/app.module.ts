import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SyncModule } from './sync/sync.module';
import { ProductsModule } from './products/products.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { AuthModule } from './auth/auth.module';
import { MarketingSummaryModule } from './marketing-summary/marketing-summary.module';
import { ProfitSegmentsModule } from './profit-segments/profit-segments.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'test',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      // Set DB_SYNCHRONIZE=false in production once the schema is stable to avoid
      // accidental schema drops when entities change.
      synchronize: process.env.DB_SYNCHRONIZE?.trim().toLowerCase() !== 'false',
    }),
    SyncModule,
    ProductsModule,
    UsersModule,
    OrdersModule,
    AuthModule,
    MarketingSummaryModule,
    ProfitSegmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
