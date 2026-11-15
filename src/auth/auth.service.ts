import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/LoginDto.js';
import { UserRole } from '../common/Enums/index.js';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { StringValue } from 'ms';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async register(createAuthDto: CreateAuthDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createAuthDto.email },
    });

    if (existingUser) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(createAuthDto.password, 10);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name: createAuthDto.name,
            email: createAuthDto.email,
            password: passwordHash,
            role: createAuthDto.role,
          },
          omit: { password: true },
        });

        await tx.wallet.create({ data: { userId: newUser.id } });

        if (newUser.role === UserRole.FREELANCER) {
          await tx.freelancerProfile.create({ data: { userId: newUser.id } });
        }

        return newUser;
      });

      return { message: 'User registered successfully', user };
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Invalid Email or password');
    }
    if (user.isBanned) throw new ForbiddenException('This account is banned');

    const tokens = await this.createSessionAndTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    const refreshSecret = this.getRefreshSecret();
    let payload: { sub: string; sid: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session || !this.safeHashCompare(session.refreshTokenHash, this.hashToken(refreshToken))) {
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.isBanned) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Account is not allowed to use the platform');
    }

    const nextRefreshToken = await this.signRefreshToken(user.id, session.id);
    const now = new Date();
    const rotation = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        refreshTokenHash: this.hashToken(nextRefreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });

    if (rotation.count !== 1) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
    });

    if (session && this.safeHashCompare(session.refreshTokenHash, this.hashToken(refreshToken))) {
      await this.prisma.session.updateMany({
        where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async getMyProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });

    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  private async createSessionAndTokens(user: {
    id: string;
    email: string;
    role: string;
    name: string;
  }) {
    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken(user.id, sessionId);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
    };
  }

  private async signAccessToken(user: { id: string; email: string; role: string }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async signRefreshToken(userId: string, sessionId: string) {
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    return this.jwtService.signAsync(
      { sub: userId, sid: sessionId, type: 'refresh' },
      { secret: this.getRefreshSecret(), expiresIn: expiresIn as StringValue },
    );
  }

  private getRefreshSecret() {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is missing from .env');
    return secret;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeHashCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
