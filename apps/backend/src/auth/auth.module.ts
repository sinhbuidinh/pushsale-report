import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET?.trim();
        if (!secret) {
          // Fail fast so we never sign tokens with a publicly-known secret in production.
          throw new Error(
            'JWT_SECRET is required. Set it in apps/backend/.env (use a long random string).',
          );
        }
        return {
          secret,
          // `expiresIn` accepts a ms-compatible string. Keep it as a literal so the
          // typed `StringValue` union from `ms` is satisfied.
          signOptions: { expiresIn: '1d' },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
