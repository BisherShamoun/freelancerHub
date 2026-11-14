// cd /home/claude/freelancehub/src &&
// # ---------------- user ----------------
// cat > user/dto/currentUserDto.ts <<'EOF'
// import { UserRole } from '../../common/Enums/index.js';

// export class currentUserDto {
//   userId: string;
//   name: string;
//   email: string;
//   role: UserRole;
// }
// EOF
// cat > user/dto/user-query-dto.ts <<'EOF'
// import { Type } from 'class-transformer';
// import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
// import { UserRole } from '../../common/Enums/index.js';

// export class UserQueryDto {
//   @IsOptional()
//   @Type(() => Number)
//   @IsInt()
//   @Min(1)
//   page: number = 1;

//   @IsOptional()
//   @Type(() => Number)
//   @IsInt()
//   @Min(1)
//   @Max(100)
//   limit: number = 10;

//   @IsOptional()
//   @IsString()
//   @MaxLength(100)
//   search?: string;

//   @IsOptional()
//   @IsIn([UserRole.CLIENT, UserRole.FREELANCER, UserRole.ADMIN])
//   role?: UserRole;

//   @IsOptional()
//   @IsIn(['name', 'email', 'createdAt'])
//   sortBy: string = 'createdAt';

//   @IsOptional()
//   @IsIn(['asc', 'desc'])
//   sortOrder: 'asc' | 'desc' = 'desc';
// }
// EOF
// cat > user/user.module.ts <<'EOF'
// import { Module } from '@nestjs/common';
// import { UserService } from './user.service.js';
// import { UserController } from './user.controller.js';

// @Module({
//   controllers: [UserController],
//   providers: [UserService],
// })
// export class UserModule {}
// EOF
// cat > user/user.controller.ts <<'EOF'
// import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
// import { UserService } from './user.service.js';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// import { RolesGuard } from '../common/guards/roles.guard.js';
// import { Roles } from '../common/decorators/roles.decorator.js';
// import { CurrentUser } from '../common/decorators/index.js';
// import { UserRole } from '../common/Enums/index.js';
// import { currentUserDto } from './dto/currentUserDto.js';
// import { UserQueryDto } from './dto/user-query-dto.js';

// @Controller('users')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles(UserRole.ADMIN)
// export class UserController {
//   constructor(private readonly userService: UserService) {}

//   @Get()
//   findAll(@Query() query: UserQueryDto) {
//     return this.userService.findAll(query);
//   }

//   @Patch(':id/ban')
//   ban(
//     @Param('id', ParseUUIDPipe) id: string,
//     @CurrentUser() currentUser: currentUserDto,
//   ) {
//     return this.userService.ban(id, currentUser);
//   }

//   @Patch(':id/unban')
//   unban(@Param('id', ParseUUIDPipe) id: string) {
//     return this.userService.unban(id);
//   }
// }
// EOF
// cat > user/user.service.ts <<'EOF'
// import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { UserRole } from '../common/Enums/index.js';
// import { currentUserDto } from './dto/currentUserDto.js';
// import { UserQueryDto } from './dto/user-query-dto.js';

// @Injectable()
// export class UserService {
//   constructor(private readonly prisma: PrismaService) {}

//   async findAll(query: UserQueryDto) {
//     const { page = 1, limit = 10, search, role, sortBy = 'createdAt', sortOrder = 'desc' } = query;
//     const skip = (page - 1) * limit;

//     const where = {
//       ...(role && { role }),
//       ...(search
//         ? {
//             OR: [
//               { name: { contains: search, mode: 'insensitive' as const } },
//               { email: { contains: search, mode: 'insensitive' as const } },
//             ],
//           }
//         : {}),
//     };

//     const [users, total] = await this.prisma.$transaction([
//       this.prisma.user.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { [sortBy]: sortOrder },
//         omit: { password: true },
//       }),
//       this.prisma.user.count({ where }),
//     ]);

//     return {
//       data: users,
//       meta: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNextPage: page * limit < total,
//         hasPreviousPage: page > 1,
//       },
//     };
//   }

//   async ban(id: string, currentUser: currentUserDto) {
//     const user = await this.prisma.user.findUnique({ where: { id } });

//     if (!user) {
//       throw new NotFoundException('User not found');
//     }

//     if (user.role === UserRole.ADMIN || user.id === currentUser.userId) {
//       throw new ForbiddenException('Admin accounts cannot be banned');
//     }

//     // The JWT strategy reads isBanned on every request, so this takes effect at once.
//     return this.prisma.user.update({
//       where: { id },
//       data: { isBanned: true },
//       omit: { password: true },
//     });
//   }

//   async unban(id: string) {
//     const user = await this.prisma.user.findUnique({ where: { id } });

//     if (!user) {
//       throw new NotFoundException('User not found');
//     }

//     return this.prisma.user.update({
//       where: { id },
//       data: { isBanned: false },
//       omit: { password: true },
//     });
//   }
// }
// EOF
// # ---------------- wallet ----------------
// cat > wallet/dto/deposit.dto.ts <<'EOF'
// import { Type } from 'class-transformer';
// import { IsNumber, Max, Min } from 'class-validator';

// export class DepositDto {
//   @Type(() => Number)
//   @IsNumber({ maxDecimalPlaces: 2 })
//   @Min(1)
//   @Max(100000)
//   amount: number;
// }
// EOF
// cat > wallet/dto/wallet-transaction-query.dto.ts <<'EOF'
// import { Type } from 'class-transformer';
// import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
// import { TransactionType } from '../../common/Enums/index.js';

// export class WalletTransactionQueryDto {
//   @IsOptional()
//   @Type(() => Number)
//   @IsInt()
//   @Min(1)
//   page: number = 1;

//   @IsOptional()
//   @Type(() => Number)
//   @IsInt()
//   @Min(1)
//   @Max(100)
//   limit: number = 10;

//   @IsOptional()
//   @IsIn(Object.values(TransactionType))
//   type?: TransactionType;
// }
// EOF
// cat > wallet/wallet.module.ts <<'EOF'
// import { Module } from '@nestjs/common';
// import { WalletService } from './wallet.service.js';
// import { WalletController } from './wallet.controller.js';

// @Module({
//   controllers: [WalletController],
//   providers: [WalletService],
// })
// export class WalletModule {}
// EOF
// cat > wallet/wallet.controller.ts <<'EOF'
// import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
// import { WalletService } from './wallet.service.js';
// import { DepositDto } from './dto/deposit.dto.js';
// import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// import { RolesGuard } from '../common/guards/roles.guard.js';
// import { Roles } from '../common/decorators/roles.decorator.js';
// import { CurrentUser } from '../common/decorators/index.js';
// import { UserRole } from '../common/Enums/index.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';

// @Controller('wallet')
// @UseGuards(JwtAuthGuard, RolesGuard)
// export class WalletController {
//   constructor(private readonly walletService: WalletService) {}

//   @Get()
//   getMyWallet(@CurrentUser() currentUser: currentUserDto) {
//     return this.walletService.getMyWallet(currentUser);
//   }

//   @Get('transactions')
//   getMyTransactions(
//     @Query() query: WalletTransactionQueryDto,
//     @CurrentUser() currentUser: currentUserDto,
//   ) {
//     return this.walletService.getMyTransactions(query, currentUser);
//   }

//   @Post('deposit')
//   @Roles(UserRole.CLIENT)
//   deposit(@Body() dto: DepositDto, @CurrentUser() currentUser: currentUserDto) {
//     return this.walletService.deposit(dto, currentUser);
//   }
// }
// EOF
// cat > wallet/wallet.service.ts <<'EOF'
// import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { Prisma } from '../generated/prisma/client.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';
// import { UserRole, TransactionType } from '../common/Enums/index.js';
// import { DepositDto } from './dto/deposit.dto.js';
// import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';

// @Injectable()
// export class WalletService {
//   constructor(private readonly prisma: PrismaService) {}

//   async getMyWallet(currentUser: currentUserDto) {
//     const wallet = await this.prisma.wallet.findUnique({
//       where: { userId: currentUser.userId },
//       select: {
//         id: true,
//         availableBalance: true,
//         heldBalance: true,
//         updatedAt: true,
//       },
//     });

//     if (!wallet) {
//       throw new NotFoundException('Wallet not found');
//     }

//     return wallet;
//   }

//   async getMyTransactions(query: WalletTransactionQueryDto, currentUser: currentUserDto) {
//     const { page = 1, limit = 10, type } = query;
//     const skip = (page - 1) * limit;

//     const where = {
//       wallet: { userId: currentUser.userId },
//       ...(type && { type }),
//     };

//     const [data, total] = await this.prisma.$transaction([
//       this.prisma.walletTransaction.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { createdAt: 'desc' },
//         include: {
//           project: {
//             select: { id: true, title: true },
//           },
//         },
//       }),
//       this.prisma.walletTransaction.count({ where }),
//     ]);

//     return {
//       data,
//       meta: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit),
//         hasNextPage: page * limit < total,
//         hasPreviousPage: page > 1,
//       },
//     };
//   }

//   // No real payment gateway in this version: the amount is simply added.
//   async deposit(dto: DepositDto, currentUser: currentUserDto) {
//     if (currentUser.role !== UserRole.CLIENT) {
//       throw new ForbiddenException('Only clients can top up their wallet');
//     }

//     const amount = new Prisma.Decimal(dto.amount);

//     return this.prisma.$transaction(async (tx) => {
//       const wallet = await tx.wallet.update({
//         where: { userId: currentUser.userId },
//         data: { availableBalance: { increment: amount } },
//       });

//       await tx.walletTransaction.create({
//         data: {
//           walletId: wallet.id,
//           type: TransactionType.DEPOSIT,
//           amount,
//           balanceAfter: wallet.availableBalance,
//         },
//       });

//       return {
//         message: 'Wallet topped up successfully',
//         availableBalance: wallet.availableBalance,
//         heldBalance: wallet.heldBalance,
//       };
//     });
//   }
// }
// EOF
// # ---------------- freelancer-profile ----------------
// cat > freelancer-profile/dto/update-freelancer-profile.dto.ts <<'EOF'
// import { Type } from 'class-transformer';
// import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// export class UpdateFreelancerProfileDto {
//   @IsOptional()
//   @IsString()
//   @MaxLength(2000)
//   bio?: string;

//   @IsOptional()
//   @Type(() => Number)
//   @IsNumber({ maxDecimalPlaces: 2 })
//   @Min(0)
//   @Max(100000)
//   hourlyRate?: number;
// }
// EOF
// cat > freelancer-profile/avatar.multer.ts <<'EOF'
// import { BadRequestException } from '@nestjs/common';
// import { diskStorage } from 'multer';
// import { mkdirSync } from 'node:fs';
// import { extname, resolve } from 'node:path';
// import { randomUUID } from 'node:crypto';
// import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// const uploadDir = resolve(process.cwd(), 'uploads', 'avatars');

// mkdirSync(uploadDir, { recursive: true });

// const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

// export const avatarMulterOptions: MulterOptions = {
//   storage: diskStorage({
//     destination: uploadDir,
//     filename: (_req, file, callback) => {
//       callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
//     },
//   }),

//   fileFilter: (_req, file, callback) => {
//     if (!allowedMimeTypes.includes(file.mimetype)) {
//       return callback(
//         new BadRequestException('Only JPEG, PNG and WEBP images are allowed'),
//         false,
//       );
//     }

//     callback(null, true);
//   },

//   limits: {
//     fileSize: 2 * 1024 * 1024, // 2 MB
//     files: 1,
//   },
// };
// EOF
// cat > freelancer-profile/freelancer-profile.module.ts <<'EOF'
// import { Module } from '@nestjs/common';
// import { FreelancerProfileService } from './freelancer-profile.service.js';
// import { FreelancerProfileController } from './freelancer-profile.controller.js';

// @Module({
//   controllers: [FreelancerProfileController],
//   providers: [FreelancerProfileService],
// })
// export class FreelancerProfileModule {}
// EOF
// cat > freelancer-profile/freelancer-profile.controller.ts <<'EOF'
// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Param,
//   ParseUUIDPipe,
//   Patch,
//   Put,
//   UploadedFile,
//   UseGuards,
//   UseInterceptors,
// } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { FreelancerProfileService } from './freelancer-profile.service.js';
// import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto.js';
// import { avatarMulterOptions } from './avatar.multer.js';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// import { RolesGuard } from '../common/guards/roles.guard.js';
// import { Roles } from '../common/decorators/roles.decorator.js';
// import { CurrentUser } from '../common/decorators/index.js';
// import { UserRole } from '../common/Enums/index.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';

// @Controller('freelancer-profile')
// export class FreelancerProfileController {
//   constructor(private readonly profileService: FreelancerProfileService) {}

//   @Put('me')
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(UserRole.FREELANCER)
//   updateMyProfile(
//     @Body() dto: UpdateFreelancerProfileDto,
//     @CurrentUser() currentUser: currentUserDto,
//   ) {
//     return this.profileService.updateMyProfile(dto, currentUser);
//   }

//   @Patch('me/avatar')
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(UserRole.FREELANCER)
//   @UseInterceptors(FileInterceptor('avatar', avatarMulterOptions))
//   updateAvatar(
//     @CurrentUser() currentUser: currentUserDto,
//     @UploadedFile() file?: Express.Multer.File,
//   ) {
//     if (!file) {
//       throw new BadRequestException('Avatar image is required');
//     }
//     return this.profileService.updateAvatar(file, currentUser);
//   }

//   // Anyone can open the profile of any freelancer, no token needed.
//   @Get(':userId')
//   findOne(@Param('userId', ParseUUIDPipe) userId: string) {
//     return this.profileService.findOne(userId);
//   }
// }
// EOF
// cat > freelancer-profile/freelancer-profile.service.ts <<'EOF'
// import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// import { unlink } from 'fs/promises';
// import { basename, resolve } from 'path';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';
// import { UserRole } from '../common/Enums/index.js';
// import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto.js';

// @Injectable()
// export class FreelancerProfileService {
//   constructor(private readonly prisma: PrismaService) {}

//   async findOne(userId: string) {
//     const profile = await this.prisma.freelancerProfile.findUnique({
//       where: { userId },
//       include: {
//         user: {
//           select: {
//             id: true,
//             name: true,
//             createdAt: true,
//           },
//         },
//       },
//     });

//     if (!profile) {
//       throw new NotFoundException('Freelancer profile not found');
//     }

//     return profile;
//   }

//   async updateMyProfile(dto: UpdateFreelancerProfileDto, currentUser: currentUserDto) {
//     if (currentUser.role !== UserRole.FREELANCER) {
//       throw new ForbiddenException('Only freelancers have a profile');
//     }

//     return this.prisma.freelancerProfile.update({
//       where: { userId: currentUser.userId },
//       data: {
//         ...(dto.bio !== undefined && { bio: dto.bio }),
//         ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
//       },
//     });
//   }

//   async updateAvatar(file: Express.Multer.File, currentUser: currentUserDto) {
//     try {
//       if (currentUser.role !== UserRole.FREELANCER) {
//         throw new ForbiddenException('Only freelancers have a profile');
//       }

//       const profile = await this.prisma.freelancerProfile.findUnique({
//         where: { userId: currentUser.userId },
//       });

//       if (!profile) {
//         throw new NotFoundException('Freelancer profile not found');
//       }

//       const updated = await this.prisma.freelancerProfile.update({
//         where: { userId: currentUser.userId },
//         data: { avatarUrl: `/uploads/avatars/${file.filename}` },
//       });

//       // Delete the previous photo only after the database update succeeded.
//       await this.removeAvatar(profile.avatarUrl);

//       return updated;
//     } catch (error) {
//       await this.removeUploadedFile(file);
//       throw error;
//     }
//   }

//   private async removeUploadedFile(file?: Express.Multer.File): Promise<void> {
//     if (!file?.path) return;
//     try {
//       await unlink(file.path);
//     } catch {}
//   }

//   private async removeAvatar(avatarUrl?: string | null): Promise<void> {
//     if (!avatarUrl?.startsWith('/uploads/avatars/')) return;

//     const filename = basename(avatarUrl);
//     if (!filename || filename === '.' || filename === '..') return;

//     try {
//       await unlink(resolve(process.cwd(), 'uploads', 'avatars', filename));
//     } catch {}
//   }
// }
// EOF
// # ---------------- category ----------------
// cat > category/dto/create-category.dto.ts <<'EOF'
// import { Transform } from 'class-transformer';
// import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// export class CreateCategoryDto {
//   @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
//   @IsString()
//   @IsNotEmpty()
//   @MinLength(2)
//   @MaxLength(60)
//   name: string;
// }
// EOF
// cat > category/dto/update-category.dto.ts <<'EOF'
// import { PartialType } from '@nestjs/mapped-types';
// import { CreateCategoryDto } from './create-category.dto.js';

// export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
// EOF
// cat > category/category.module.ts <<'EOF'
// import { Module } from '@nestjs/common';
// import { CategoryService } from './category.service.js';
// import { CategoryController } from './category.controller.js';

// @Module({
//   controllers: [CategoryController],
//   providers: [CategoryService],
// })
// export class CategoryModule {}
// EOF
// cat > category/category.controller.ts <<'EOF'
// import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
// import { CategoryService } from './category.service.js';
// import { CreateCategoryDto } from './dto/create-category.dto.js';
// import { UpdateCategoryDto } from './dto/update-category.dto.js';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// import { RolesGuard } from '../common/guards/roles.guard.js';
// import { Roles } from '../common/decorators/roles.decorator.js';
// import { UserRole } from '../common/Enums/index.js';

// @Controller('category')
// export class CategoryController {
//   constructor(private readonly categoryService: CategoryService) {}

//   // Public: the list is shown on almost every page.
//   @Get()
//   findAll() {
//     return this.categoryService.findAll();
//   }

//   @Post()
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(UserRole.ADMIN)
//   create(@Body() dto: CreateCategoryDto) {
//     return this.categoryService.create(dto);
//   }

//   @Patch(':id')
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(UserRole.ADMIN)
//   update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
//     return this.categoryService.update(id, dto);
//   }

//   @Delete(':id')
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(UserRole.ADMIN)
//   remove(@Param('id', ParseUUIDPipe) id: string) {
//     return this.categoryService.remove(id);
//   }
// }
// EOF
// cat > category/category.service.ts <<'EOF'
// import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
// import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { CreateCategoryDto } from './dto/create-category.dto.js';
// import { UpdateCategoryDto } from './dto/update-category.dto.js';

// const CATEGORIES_KEY = 'categories:all';
// // The list almost never changes, so it can stay in the cache for an hour.
// // Any change made by the admin deletes the key at once.
// const CATEGORIES_TTL = 60 * 60 * 1000;

// @Injectable()
// export class CategoryService {
//   constructor(
//     private readonly prisma: PrismaService,
//     @Inject(CACHE_MANAGER) private readonly cache: Cache,
//   ) {}

//   async findAll() {
//     const cached = await this.cache.get<any>(CATEGORIES_KEY);

//     if (cached !== undefined && cached !== null) {
//       return cached;
//     }

//     const categories = await this.prisma.category.findMany({
//       orderBy: { name: 'asc' },
//     });

//     await this.cache.set(CATEGORIES_KEY, categories, CATEGORIES_TTL);

//     return categories;
//   }

//   async create(dto: CreateCategoryDto) {
//     try {
//       const category = await this.prisma.category.create({
//         data: { name: dto.name },
//       });
//       await this.cache.del(CATEGORIES_KEY);
//       return category;
//     } catch (error) {
//       if (this.isPrismaError(error, 'P2002')) {
//         throw new ConflictException('Category already exists');
//       }
//       throw error;
//     }
//   }

//   async update(id: string, dto: UpdateCategoryDto) {
//     await this.getCategory(id);

//     try {
//       const category = await this.prisma.category.update({
//         where: { id },
//         data: {
//           ...(dto.name !== undefined && { name: dto.name }),
//         },
//       });
//       await this.cache.del(CATEGORIES_KEY);
//       return category;
//     } catch (error) {
//       if (this.isPrismaError(error, 'P2002')) {
//         throw new ConflictException('Category already exists');
//       }
//       throw error;
//     }
//   }

//   async remove(id: string) {
//     await this.getCategory(id);

//     try {
//       await this.prisma.category.delete({ where: { id } });
//     } catch (error) {
//       // A category that still has projects cannot be deleted.
//       if (this.isPrismaError(error, 'P2003')) {
//         throw new ConflictException('Cannot delete a category that has projects');
//       }
//       throw error;
//     }

//     await this.cache.del(CATEGORIES_KEY);

//     return { message: 'Category deleted successfully' };
//   }

//   private async getCategory(id: string) {
//     const category = await this.prisma.category.findUnique({ where: { id } });

//     if (!category) {
//       throw new NotFoundException('Category not found');
//     }

//     return category;
//   }

//   private isPrismaError(error: unknown, code: string): boolean {
//     return (
//       typeof error === 'object' &&
//       error !== null &&
//       'code' in error &&
//       error.code === code
//     );
//   }
// }
// EOF
// echo ok
// Output

// ok
