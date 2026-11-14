import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { CreateAuthDto } from './dto/create-auth.dto.js';
// import { JwtService } from '@nestjs/jwt';
// import * as bcrypt from 'bcrypt';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { CreateAuthDto } from './dto/create-auth.dto.js';
// import { LoginDto } from './dto/LoginDto.js';
// import { UserRole } from '../common/Enums/index.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async register(createAuthDto: CreateAuthDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createAuthDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(createAuthDto.password, 10);

    try {
      // The user, his wallet (and the freelancer profile) are created together or not at all.
      const user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name: createAuthDto.name,
            email: createAuthDto.email,
            password: passwordHash,
            role: createAuthDto.role,
          },
          omit: {
            password: true,
          },
        });

        await tx.wallet.create({
          data: { userId: newUser.id },
        });

        if (newUser.role === UserRole.FREELANCER) {
          await tx.freelancerProfile.create({
            data: { userId: newUser.id },
          });
        }

        return newUser;
      });

      return { message: 'User registered successfully', user };
    } catch (error) {
      // Two requests with the same email at the same moment.
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

    if (!user) {
      throw new UnauthorizedException('Invalid Email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid Email or password');
    }

    if (user.isBanned) {
      throw new ForbiddenException('This account is banned');
    }

    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getMyProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: {
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    return user;
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
