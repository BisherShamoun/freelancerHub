cd /home/claude/freelancehub/src && 
cat > common/Enums/index.ts <<'EOF'
export enum UserRole {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  FREELANCER = 'FREELANCER',
}

export enum ProjectStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum ProposalStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  HOLD = 'HOLD',
  PAYOUT = 'PAYOUT',
  COMMISSION = 'COMMISSION',
}
EOF
cat > common/constants/index.ts <<'EOF'
// Platform commission taken from every approved delivery (10%).
export const COMMISSION_RATE = 0.1;
EOF
cat > common/decorators/index.ts <<'EOF'
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user[data] : request.user;
  },
);
EOF
cat > common/decorators/roles.decorator.ts <<'EOF'
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../Enums/index.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
EOF
cat > common/guards/roles.guard.ts <<'EOF'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole } from '../Enums/index.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    // No admin bypass here: an admin must not be able to act as a client or a freelancer.
    return roles.includes(user?.role);
  }
}
EOF
cat > prisma/prisma.module.ts <<'EOF'
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
EOF
cat > prisma/prisma.service.ts <<'EOF'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
EOF
cat > main.ts <<'EOF'
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Only public files live under /uploads (avatars, project attachments).
  // Delivery files are private and are never served from here.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(3000, () => {
    console.log('service started on port 3000');
  });
}
await bootstrap();
EOF
cat > app.module.ts <<'EOF'
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { FreelancerProfileModule } from './freelancer-profile/freelancer-profile.module.js';
import { CategoryModule } from './category/category.module.js';
import { ProjectModule } from './project/project.module.js';
import { ProposalModule } from './proposal/proposal.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule.register({ isGlobal: true, ttl: 60_000 }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UserModule,
    WalletModule,
    FreelancerProfileModule,
    CategoryModule,
    ProjectModule,
    ProposalModule,
    DeliveryModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
EOF
# ---------------- auth ----------------
cat > auth/dto/create-auth.dto.ts <<'EOF'
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../common/Enums/index.js';

export class CreateAuthDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(70)
  password: string;

  // The admin account is never created from registration.
  @IsIn([UserRole.CLIENT, UserRole.FREELANCER])
  role: UserRole.CLIENT | UserRole.FREELANCER;
}
EOF
cat > auth/dto/LoginDto.ts <<'EOF'
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
EOF
cat > auth/jwt-auth.guard.ts <<'EOF'
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
EOF
cat > auth/jwt.strategy.ts <<'EOF'
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is missing from .env');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  // Runs on every request. Reading the user from the database means a ban
  // (or a deleted user) stops working immediately, even with a valid token.
  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isBanned: true },
    });

    if (!user || user.isBanned) {
      throw new UnauthorizedException('Account is not allowed to use the platform');
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
EOF
cat > auth/auth.module.ts <<'EOF'
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is missing from .env');
        }
        // One token that lasts a week: the user stays logged in, and the
        // strategy re-checks the account (ban) on every request.
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
        return {
          secret,
          signOptions: { expiresIn: expiresIn as StringValue },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
EOF
cat > auth/auth.service.ts <<'EOF'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LoginDto } from './dto/LoginDto.js';
import { UserRole } from '../common/Enums/index.js';

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
EOF
cat > auth/auth.controller.ts <<'EOF'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LoginDto } from './dto/LoginDto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/index.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: CreateAuthDto) {
    return this.authService.register(body);
  }

  // 5 attempts per minute against password guessing
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser('userId') id: string) {
    return this.authService.getMyProfile(id);
  }
}
EOF
echo done
Output

done