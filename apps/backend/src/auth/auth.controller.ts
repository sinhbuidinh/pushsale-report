import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';

interface LoginBody {
  username: string;
  password: string;
}

interface ChangePasswordBody {
  newPassword: string;
}

interface JwtRequestUser {
  sub: number;
  username: string;
  type: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginBody) {
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
      const data = this.authService.login(user);
      return {
        status: true,
        data: data,
      };
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req: { user: JwtRequestUser },
    @Body() body: ChangePasswordBody,
  ) {
    try {
      const result = await this.authService.updatePassword(
        req.user.sub,
        body.newPassword,
      );
      return {
        status: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
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
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }
}
