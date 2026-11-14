from pathlib import Path
import textwrap, zipfile, os

base = Path("/mnt/data/FreelanceHub_backend")
files = {}

files[".env"] = r'''# Copy this file to .env and replace the values
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/freelance_hub?schema=public"
JWT_SECRET="CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS"
JWT_EXPIRES_IN="1d"
PORT=3000
UPLOAD_DIR="./uploads"
MAX_UPLOAD_SIZE_MB=10
'''

files["prisma/schema.prisma"] = r'''generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CLIENT
  FREELANCER
  ADMIN
}

enum ProjectStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
}

enum ProposalStatus {
  PENDING
  ACCEPTED
  REJECTED
}

enum TransactionType {
  DEPOSIT
  HOLD
  PAYOUT
  COMMISSION
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  name         String
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         Role
  isBanned     Boolean  @default(false) @map("is_banned")
  createdAt    DateTime @default(now()) @map("created_at")

  freelancerProfile FreelancerProfile?
  wallet            Wallet?
  clientProjects    Project[] @relation("ClientProjects")
  proposals         Proposal[] @relation("FreelancerProposals")

  @@map("users")
}

model FreelancerProfile {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @unique @map("user_id") @db.Uuid
  bio        String?  @db.Text
  hourlyRate Decimal? @map("hourly_rate") @db.Decimal(10, 2)
  avatarPath String?  @map("avatar_path")
  updatedAt  DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("freelancer_profiles")
}

model Wallet {
  id               String   @id @default(uuid()) @db.Uuid
  userId           String   @unique @map("user_id") @db.Uuid
  availableBalance Decimal  @default(0) @map("available_balance") @db.Decimal(12, 2)
  heldBalance      Decimal  @default(0) @map("held_balance") @db.Decimal(12, 2)
  updatedAt        DateTime @updatedAt @map("updated_at")

  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[]

  @@map("wallets")
}

model WalletTransaction {
  id            String          @id @default(uuid()) @db.Uuid
  walletId      String          @map("wallet_id") @db.Uuid
  projectId     String?         @map("project_id") @db.Uuid
  type          TransactionType
  amount        Decimal         @db.Decimal(12, 2)
  balanceAfter  Decimal         @map("balance_after") @db.Decimal(12, 2)
  createdAt     DateTime        @default(now()) @map("created_at")

  wallet Wallet @relation(fields: [walletId], references: [id], onDelete: Restrict)

  @@index([walletId, createdAt])
  @@index([projectId])
  @@map("wallet_transactions")
}

model Category {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  projects  Project[]

  @@map("categories")
}

model Project {
  id             String        @id @default(uuid()) @db.Uuid
  clientId       String        @map("client_id") @db.Uuid
  categoryId     String        @map("category_id") @db.Uuid
  title          String
  description    String        @db.Text
  budget         Decimal       @db.Decimal(12, 2)
  status         ProjectStatus @default(OPEN)
  attachmentPath String?       @map("attachment_path")
  attachmentName String?       @map("attachment_name")
  attachmentMime String?       @map("attachment_mime")
  attachmentSize Int?          @map("attachment_size")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  client       User                @relation("ClientProjects", fields: [clientId], references: [id], onDelete: Restrict)
  category     Category            @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  proposals    Proposal[]
  delivery     Delivery?
  transactions WalletTransaction[]

  @@index([status, createdAt])
  @@index([categoryId, status])
  @@map("projects")
}

model Proposal {
  id           String         @id @default(uuid()) @db.Uuid
  projectId    String         @map("project_id") @db.Uuid
  freelancerId String         @map("freelancer_id") @db.Uuid
  price        Decimal        @db.Decimal(12, 2)
  durationDays Int            @map("duration_days")
  message      String         @db.Text
  status       ProposalStatus @default(PENDING)
  createdAt    DateTime       @default(now()) @map("created_at")

  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  freelancer User    @relation("FreelancerProposals", fields: [freelancerId], references: [id], onDelete: Restrict)

  @@unique([projectId, freelancerId])
  @@index([projectId, status])
  @@map("proposals")
}

model Delivery {
  id         String    @id @default(uuid()) @db.Uuid
  projectId  String    @unique @map("project_id") @db.Uuid
  filePath   String    @map("file_path")
  fileName   String    @map("file_name")
  sizeBytes  Int       @map("size_bytes")
  uploadedAt DateTime  @default(now()) @map("uploaded_at")
  approvedAt DateTime? @map("approved_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("deliveries")
}
'''

files["src/main.ts"] = r'''import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
'''

files["src/app.module.ts"] = r'''import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProjectsModule } from './projects/projects.module';
import { ProposalsModule } from './proposals/proposals.module';
import { WalletsModule } from './wallets/wallets.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProjectsModule,
    ProposalsModule,
    WalletsModule,
    DeliveriesModule,
    AdminModule,
  ],
})
export class AppModule {}
'''

files["src/prisma/prisma.module.ts"] = r'''import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
'''
files["src/prisma/prisma.service.ts"] = r'''import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
'''

files["src/common/decorators/current-user.decorator.ts"] = r'''import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
'''
files["src/common/decorators/roles.decorator.ts"] = r'''import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
'''
files["src/common/guards/jwt-auth.guard.ts"] = r'''import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
'''
files["src/common/guards/roles.guard.ts"] = r'''import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest();
    return roles.includes(request.user?.role);
  }
}
'''
files["src/common/guards/active-user.guard.ts"] = r'''import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isBanned: true },
    });
    if (!user || user.isBanned) throw new ForbiddenException('Account is unavailable');
    return true;
  }
}
'''

files["src/auth/dto/register.dto.ts"] = r'''import { IsEmail, IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8) @MaxLength(72)
  password: string;

  @IsEnum(Role)
  role: Role;
}
'''
files["src/auth/dto/login.dto.ts"] = r'''import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;
}
'''
files["src/auth/strategies/jwt.strategy.ts"] = r'''import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'development-secret-change-me',
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isBanned: true },
    });
    if (!user || user.isBanned) throw new UnauthorizedException();
    return { sub: user.id, email: user.email, role: user.role };
  }
}
'''
files["src/auth/auth.service.ts"] = r'''import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(dto: RegisterDto) {
    if (dto.role === Role.ADMIN) throw new UnauthorizedException('Admin cannot self-register');
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash,
          role: dto.role,
          wallet: { create: {} },
          ...(dto.role === Role.FREELANCER ? { freelancerProfile: { create: {} } } : {}),
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      return created;
    });
    return { user, accessToken: await this.signToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || user.isBanned || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken: await this.signToken(user.id, user.email, user.role),
    };
  }

  private signToken(id: string, email: string, role: Role) {
    return this.jwt.signAsync({ sub: id, email, role });
  }
}
'''
files["src/auth/auth.controller.ts"] = r'''import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto); }
}
'''
files["src/auth/auth.module.ts"] = r'''import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'development-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '1d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
'''

files["src/users/users.module.ts"] = r'''import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';

@Module({ controllers: [UsersController] })
export class UsersModule {}
'''
files["src/users/users.controller.ts"] = r'''import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  me(@CurrentUser() user: { sub: string }) {
    return this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        freelancerProfile: true,
        wallet: { select: { availableBalance: true, heldBalance: true } },
      },
    });
  }
}
'''

files["src/categories/dto/create-category.dto.ts"] = r'''import { IsString, MinLength, MaxLength } from 'class-validator';
export class CreateCategoryDto {
  @IsString() @MinLength(2) @MaxLength(80)
  name: string;
}
'''
files["src/categories/categories.module.ts"] = r'''import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';

@Module({ controllers: [CategoriesController] })
export class CategoriesModule {}
'''
files["src/categories/categories.controller.ts"] = r'''import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() { return this.prisma.category.findMany({ orderBy: { name: 'asc' } }); }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { name: dto.name } });
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string) {
    const projects = await this.prisma.project.count({ where: { categoryId: id } });
    if (projects) return { deleted: false, message: 'Category is in use by projects' };
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }
}
'''

files["src/projects/dto/create-project.dto.ts"] = r'''import { IsString, IsUUID, MinLength, MaxLength, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsUUID() categoryId: string;
  @IsString() @MinLength(4) @MaxLength(150) title: string;
  @IsString() @MinLength(20) description: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) budget: number;
}
'''
files["src/projects/projects.module.ts"] = r'''import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';

@Module({ controllers: [ProjectsController] })
export class ProjectsModule {}
'''
files["src/projects/projects.controller.ts"] = r'''import { Body, Controller, Get, Param, Post, Query, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  browse(@Query('categoryId') categoryId?: string, @Query('q') q?: string,
         @Query('page') page = '1', @Query('limit') limit = '10') {
    const p = Math.max(1, Number(page) || 1);
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const where = {
      status: ProjectStatus.OPEN,
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { description: { contains: q, mode: 'insensitive' as const } }] } : {}),
    };
    return this.prisma.project.findMany({
      where, skip: (p - 1) * take, take,
      orderBy: { createdAt: 'desc' },
      include: { category: true, client: { select: { id: true, name: true } } },
    }).then(async (data) => ({
      data,
      total: await this.prisma.project.count({ where }),
      page: p, limit: take,
    }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { category: true, client: { select: { id: true, name: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: { sub: string; role: Role }) {
    if (user.role !== Role.CLIENT) throw new ForbiddenException('Only clients can publish projects');
    return this.prisma.project.create({
      data: {
        clientId: user.sub, categoryId: dto.categoryId,
        title: dto.title, description: dto.description,
        budget: dto.budget,
      },
    });
  }
}
'''

files["src/proposals/dto/create-proposal.dto.ts"] = r'''import { IsString, IsUUID, IsNumber, Min, MinLength, MaxLength, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProposalDto {
  @IsUUID() projectId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
  @Type(() => Number) @IsInt() @Min(1) durationDays: number;
  @IsString() @MinLength(10) @MaxLength(3000) message: string;
}
'''
files["src/proposals/proposals.module.ts"] = r'''import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';

@Module({ controllers: [ProposalsController] })
export class ProposalsModule {}
'''
files["src/proposals/proposals.controller.ts"] = r'''import { Body, ConflictException, Controller, Get, Param, Post, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectStatus, ProposalStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';

@ApiTags('Proposals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('proposals')
export class ProposalsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async create(@Body() dto: CreateProposalDto, @CurrentUser() user: { sub: string; role: Role }) {
    if (user.role !== Role.FREELANCER) throw new ForbiddenException('Only freelancers can submit proposals');
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project || project.status !== ProjectStatus.OPEN) throw new NotFoundException('Open project not found');
    if (project.clientId === user.sub) throw new ConflictException('Cannot apply to your own project');
    return this.prisma.proposal.create({
      data: { ...dto, freelancerId: user.sub },
    });
  }

  @Get('mine')
  findMine(@CurrentUser() user: { sub: string }) {
    return this.prisma.proposal.findMany({
      where: { freelancerId: user.sub },
      include: { project: { select: { id: true, title: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('project/:projectId')
  async forProject(@Param('projectId') projectId: string, @CurrentUser() user: { sub: string; role: Role }) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (project.clientId !== user.sub && user.role !== Role.ADMIN) throw new ForbiddenException();
    return this.prisma.proposal.findMany({
      where: { projectId },
      include: { freelancer: { select: { id: true, name: true, freelancerProfile: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() user: { sub: string; role: Role }) {
    if (user.role !== Role.CLIENT) throw new ForbiddenException('Only project owner can accept');
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.findUnique({
        where: { id }, include: { project: true },
      });
      if (!proposal) throw new NotFoundException('Proposal not found');
      if (proposal.project.clientId !== user.sub) throw new ForbiddenException();
      if (proposal.status !== ProposalStatus.PENDING || proposal.project.status !== ProjectStatus.OPEN) {
        throw new ConflictException('Proposal or project is no longer open');
      }

      const amount = proposal.price;
      const wallet = await tx.wallet.findUnique({ where: { userId: user.sub } });
      if (!wallet || wallet.availableBalance.lessThan(amount)) {
        throw new ConflictException('Insufficient available wallet balance');
      }

      const lockedProject = await tx.project.updateMany({
        where: { id: proposal.projectId, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.IN_PROGRESS },
      });
      if (lockedProject.count !== 1) throw new ConflictException('Project already accepted by another request');

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { decrement: amount },
          heldBalance: { increment: amount },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id, projectId: proposal.projectId, type: 'HOLD',
          amount, balanceAfter: updatedWallet.availableBalance,
        },
      });
      await tx.proposal.update({ where: { id }, data: { status: ProposalStatus.ACCEPTED } });
      await tx.proposal.updateMany({
        where: { projectId: proposal.projectId, id: { not: id }, status: ProposalStatus.PENDING },
        data: { status: ProposalStatus.REJECTED },
      });
      return { accepted: true, projectId: proposal.projectId, escrowAmount: amount };
    });
  }
}
'''

files["src/wallets/wallets.module.ts"] = r'''import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';

@Module({ controllers: [WalletsController] })
export class WalletsModule {}
'''
files["src/wallets/wallets.controller.ts"] = r'''import { Body, Controller, Get, Post, UseGuards, ForbiddenException, ConflictException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';

class DepositDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1)
  amount: number;
}

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('wallet')
export class WalletsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async mine(@CurrentUser() user: { sub: string }) {
    return this.prisma.wallet.findUnique({
      where: { userId: user.sub },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
  }

  // Development/demo endpoint only. Replace with a verified payment provider before production.
  @Post('demo-deposit')
  async demoDeposit(@Body() dto: DepositDto, @CurrentUser() user: { sub: string; role: Role }) {
    if (user.role === Role.ADMIN) throw new ForbiddenException('Use a normal account for testing');
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: user.sub } });
      if (!wallet) throw new ConflictException('Wallet not found');
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { availableBalance: { increment: dto.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id, type: 'DEPOSIT', amount: dto.amount,
          balanceAfter: updated.availableBalance,
        },
      });
      return updated;
    });
  }
}
'''

files["src/deliveries/deliveries.module.ts"] = r'''import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller';

@Module({ controllers: [DeliveriesController] })
export class DeliveriesModule {}
'''
files["src/deliveries/deliveries.controller.ts"] = r'''import {
  BadRequestException, Controller, Get, Param, Post, UploadedFile, UseGuards,
  UseInterceptors, NotFoundException, ForbiddenException, Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, basename, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { Response } from 'express';
import { ProjectStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../common/guards/active-user.guard';

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

@ApiTags('Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private prisma: PrismaService) {}

  @Post(':projectId')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
    }),
    limits: { fileSize: (Number(process.env.MAX_UPLOAD_SIZE_MB) || 10) * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!['.pdf', '.zip', '.rar', '.7z'].includes(ext)) return cb(new BadRequestException('Only PDF or archive files are allowed'), false);
      cb(null, true);
    },
  }))
  async upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { sub: string; role: Role },
  ) {
    if (!file) throw new BadRequestException('File is required');
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const accepted = await this.prisma.proposal.findFirst({
      where: { projectId, status: 'ACCEPTED', freelancerId: user.sub },
    });
    if (user.role !== Role.FREELANCER || !accepted || project.status !== ProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('Only the assigned freelancer can upload delivery');
    }
    const existing = await this.prisma.delivery.findUnique({ where: { projectId } });
    if (existing) throw new BadRequestException('A delivery already exists for this project');
    return this.prisma.delivery.create({
      data: {
        projectId, filePath: file.path, fileName: basename(file.originalname),
        sizeBytes: file.size,
      },
    });
  }

  @Get(':projectId/download')
  async download(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Res() res: Response,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { projectId }, include: { project: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const assigned = await this.prisma.proposal.findFirst({
      where: { projectId, status: 'ACCEPTED', freelancerId: user.sub },
    });
    if (user.role !== Role.ADMIN && delivery.project.clientId !== user.sub && !assigned) {
      throw new ForbiddenException();
    }
    return res.download(delivery.filePath, delivery.fileName);
  }

  @Post(':projectId/approve')
  async approve(
    @Param('projectId') projectId: string,
    @CurrentUser() user: { sub: string; role: Role },
  ) {
    if (user.role !== Role.CLIENT) throw new ForbiddenException('Only client can approve');
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.clientId !== user.sub) throw new NotFoundException('Project not found');
      if (project.status !== ProjectStatus.IN_PROGRESS) throw new BadRequestException('Project is not in progress');
      const delivery = await tx.delivery.findUnique({ where: { projectId } });
      if (!delivery) throw new NotFoundException('Delivery not found');
      const accepted = await tx.proposal.findFirst({ where: { projectId, status: 'ACCEPTED' } });
      if (!accepted) throw new BadRequestException('Accepted proposal not found');

      const clientWallet = await tx.wallet.findUnique({ where: { userId: user.sub } });
      const freelancerWallet = await tx.wallet.findUnique({ where: { userId: accepted.freelancerId } });
      const admin = await tx.user.findFirst({ where: { role: Role.ADMIN } });
      if (!clientWallet || !freelancerWallet || !admin) throw new BadRequestException('Required wallets are missing');
      const platformWallet = await tx.wallet.findUnique({ where: { userId: admin.id } });
      if (!platformWallet) throw new BadRequestException('Platform wallet is missing');

      const amount = accepted.price;
      const payout = amount.mul(0.9);
      const commission = amount.sub(payout);
      if (clientWallet.heldBalance.lessThan(amount)) throw new BadRequestException('Escrow balance mismatch');

      const clientUpdated = await tx.wallet.update({
        where: { id: clientWallet.id }, data: { heldBalance: { decrement: amount } },
      });
      const freelancerUpdated = await tx.wallet.update({
        where: { id: freelancerWallet.id }, data: { availableBalance: { increment: payout } },
      });
      const platformUpdated = await tx.wallet.update({
        where: { id: platformWallet.id }, data: { availableBalance: { increment: commission } },
      });
      await tx.walletTransaction.createMany({ data: [
        { walletId: clientWallet.id, projectId, type: 'PAYOUT', amount: amount.neg(), balanceAfter: clientUpdated.availableBalance },
        { walletId: freelancerWallet.id, projectId, type: 'PAYOUT', amount: payout, balanceAfter: freelancerUpdated.availableBalance },
        { walletId: platformWallet.id, projectId, type: 'COMMISSION', amount: commission, balanceAfter: platformUpdated.availableBalance },
      ]});
      await tx.delivery.update({ where: { id: delivery.id }, data: { approvedAt: new Date() } });
      await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.COMPLETED } });
      return { completed: true, freelancerPayout: payout, platformCommission: commission };
    });
  }
}
'''

files["src/admin/admin.module.ts"] = r'''import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';

@Module({ controllers: [AdminController] })
export class AdminModule {}
'''
files["src/admin/admin.controller.ts"] = r'''import { Body, Controller, Get, Param, Patch, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Patch('users/:id/ban')
  async ban(@Param('id') id: string, @Body('isBanned') isBanned: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === Role.ADMIN) return { updated: false, message: 'Cannot ban an admin through this endpoint' };
    await this.prisma.user.update({ where: { id }, data: { isBanned: Boolean(isBanned) } });
    return { updated: true, isBanned: Boolean(isBanned) };
  }

  @Get('dashboard')
  async dashboard() {
    const [users, projects, commission] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.walletTransaction.aggregate({
        where: { type: 'COMMISSION' }, _sum: { amount: true },
      }),
    ]);
    return { users, projects, totalCommission: commission._sum.amount || 0 };
  }
}
'''

# Readme deliberately omitted: user requested only src, prisma and env.
for rel, content in files.items():
    dest = base / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")

# Create archive with only src/, prisma/, .env
zip_path = Path("/mnt/data/FreelanceHub_src_prisma_env.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for rel in ["src", "prisma", ".env"]:
        folder = base / rel
        if folder.is_dir():
            for f in folder.rglob("*"):
                if f.is_file():
                    z.write(f, Path("FreelanceHub") / f.relative_to(base))
        else:
            z.write(folder, Path("FreelanceHub") / rel)
print("Created archive:", zip_path, "size:", zip_path.stat().st_size)
print("Files:", len(files))
