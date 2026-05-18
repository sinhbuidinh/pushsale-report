import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';

/** User fields exposed after authentication (password never included). */
export type SafeUser = Omit<User, 'password'>;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<SafeUser | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (user && user.password && (await bcrypt.compare(pass, user.password))) {
      const { password: _password, ...safeUser } = user;
      return safeUser;
    }
    return null;
  }

  login(user: SafeUser) {
    const payload = { username: user.username, sub: user.id, type: user.type };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        type: user.type,
      },
    };
  }

  async updatePassword(userId: number, newPass: string) {
    const hashedPassword = await bcrypt.hash(newPass, 10);
    await this.userRepo.update(userId, { password: hashedPassword });
    return { success: true };
  }

  // Helper to seed an admin user
  async seedAdmin() {
    const admin = await this.userRepo.findOne({ where: { username: 'admin' } });
    if (!admin) {
      const hashedPassword = await bcrypt.hash('admin@2026', 10);
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
}
