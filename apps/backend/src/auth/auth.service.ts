import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import {
  durationToMs,
  durationToSeconds,
  getJwtAccessExpiresIn,
  getJwtRefreshExpiresIn,
} from './jwt-config';

/** User fields exposed after authentication (password never included). */
export type SafeUser = Omit<User, 'password'>;

export type AuthResponse = {
  access_token: string;
  expires_in: number;
  user: {
    id: number;
    username: string;
    display_name: string;
    type: string;
  };
};

type IssuedTokens = AuthResponse & { refresh_token: string };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<SafeUser | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password, ...safeUser } = user;
      void password;
      return safeUser;
    }
    return null;
  }

  async login(user: SafeUser): Promise<IssuedTokens> {
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: {
        token_hash: tokenHash,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo.findOne({ where: { id: stored.user_id } });
    if (!user) {
      await this.revokeRefreshToken(stored.id);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.revokeRefreshToken(stored.id);
    const { password, ...safeUser } = user;
    void password;
    return this.issueTokens(safeUser);
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { token_hash: tokenHash, revoked_at: IsNull() },
    });
    if (stored) {
      await this.revokeRefreshToken(stored.id);
    }
    return { success: true };
  }

  async updatePassword(userId: number, newPass: string) {
    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.userRepo.update(userId, { password: hashedPassword });
    await this.revokeAllRefreshTokensForUser(userId);
    return { success: true };
  }

  // Helper to seed an admin user
  async seedAdmin() {
    const admin = await this.userRepo.findOne({ where: { username: 'admin' } });
    if (!admin) {
      const seedPassword = process.env.DEFAULT_ADMIN_PASSWORD?.trim();
      if (!seedPassword) {
        throw new Error('DEFAULT_ADMIN_PASSWORD is not set');
      }
      const hashedPassword = await bcrypt.hash(seedPassword, 10);
      await this.userRepo.save({
        username: 'admin',
        password: hashedPassword,
        display_name: 'Administrator',
        type: 'admin',
      });

      return 'Admin seeded done';
    }

    return 'Admin already exists';
  }

  private async issueTokens(user: SafeUser): Promise<IssuedTokens> {
    const accessExpiresIn = getJwtAccessExpiresIn();
    const payload = { username: user.username, sub: user.id, type: user.type };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpiresIn,
    });
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + durationToMs(getJwtRefreshExpiresIn()),
    );

    await this.refreshTokenRepo.save({
      user_id: user.id,
      token_hash: this.hashRefreshToken(refreshToken),
      expires_at: refreshExpiresAt,
      revoked_at: null,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: durationToSeconds(accessExpiresIn),
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        type: user.type,
      },
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async revokeRefreshToken(id: number): Promise<void> {
    await this.refreshTokenRepo.update(id, { revoked_at: new Date() });
  }

  private async revokeAllRefreshTokensForUser(userId: number): Promise<void> {
    await this.refreshTokenRepo.update(
      { user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }
}
