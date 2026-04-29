import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any) {
    try {
      const user = await this.authService.validateUser(
        body.username,
        body.password,
      );
      if (!user) {
        return {
          status: false,
          error: 'Invalid username or password',
        };
      }
      const data = await this.authService.login(user);
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

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Request() req: any, @Body() body: any) {
    try {
      const result = await this.authService.updatePassword(
        req.user.sub,
        body.newPassword,
      );
      return {
        status: true,
        data: result,
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
      };
    }
  }

  @Get('seed')
  async seed() {
    try {
      const result = await this.authService.seedAdmin();
      return {
        status: true,
        data: result,
      };
    } catch (error) {
      return {
        status: false,
        error: error.message,
      };
    }
  }
}
