import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  Req,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { httpErrorMessage } from '../common/http-error.util';
import {
  clearRefreshTokenCookie,
  readRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from './refresh-token-cookie';

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
  async login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ) {
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
      const { refresh_token, ...data } = await this.authService.login(user);
      setRefreshTokenCookie(res, refresh_token);
      return {
        status: true,
        data,
      };
    } catch (error: unknown) {
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }

  @Post('refresh')
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const refreshToken = readRefreshTokenFromRequest(req);
      if (!refreshToken) {
        return {
          status: false,
          error: 'Refresh token is required',
        };
      }
      const { refresh_token, ...data } =
        await this.authService.refresh(refreshToken);
      setRefreshTokenCookie(res, refresh_token);
      return {
        status: true,
        data,
      };
    } catch (error: unknown) {
      clearRefreshTokenCookie(res);
      return {
        status: false,
        error: httpErrorMessage(error),
      };
    }
  }

  @Post('logout')
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const refreshToken = readRefreshTokenFromRequest(req);
      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }
      clearRefreshTokenCookie(res);
      return {
        status: true,
        data: { success: true },
      };
    } catch (error: unknown) {
      clearRefreshTokenCookie(res);
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
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.updatePassword(
        req.user.sub,
        body.newPassword,
      );
      clearRefreshTokenCookie(res);
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
