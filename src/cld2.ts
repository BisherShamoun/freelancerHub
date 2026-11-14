cd /home/claude/freelancehub/src && 
# ---------------- project ----------------
cat > project/dto/create-project.dto.ts <<'EOF'
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProjectDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @IsUUID()
  categoryId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  budget: number;
}
EOF
cat > project/dto/update-project.dto.ts <<'EOF'
import { PartialType } from '@nestjs/mapped-types';
import { CreateProjectDto } from './create-project.dto.js';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
EOF
cat > project/dto/project-query.dto.ts <<'EOF'
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ProjectStatus } from '../../common/Enums/index.js';

export class ProjectQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Used only by "my projects"; the public browse page always shows open projects.
  @IsOptional()
  @IsIn(Object.values(ProjectStatus))
  status?: ProjectStatus;

  @IsOptional()
  @IsIn(['createdAt', 'budget'])
  sortBy: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
EOF
cat > project/project.multer.ts <<'EOF'
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const uploadDir = resolve(process.cwd(), 'uploads', 'projects');

mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const projectMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: uploadDir,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),

  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new BadRequestException('Only JPEG, PNG, WEBP images or PDF files are allowed'),
        false,
      );
    }

    callback(null, true);
  },

  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
};
EOF
cat > project/project.module.ts <<'EOF'
import { Module } from '@nestjs/common';
import { ProjectService } from './project.service.js';
import { ProjectController } from './project.controller.js';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
EOF
cat > project/project.controller.ts <<'EOF'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectService } from './project.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectQueryDto } from './dto/project-query.dto.js';
import { projectMulterOptions } from './project.multer.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('attachment', projectMulterOptions))
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projectService.create(dto, currentUser, file);
  }

  // Browse page: open projects, paginated, with filters and sorting.
  @Get()
  findAll(@Query() query: ProjectQueryDto) {
    return this.projectService.findAll(query);
  }

  // Must stay above ':id' so that "mine" is not read as an id.
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  findMine(
    @Query() query: ProjectQueryDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.projectService.findMine(query, currentUser);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('attachment', projectMulterOptions))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projectService.update(id, dto, currentUser, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.projectService.remove(id, currentUser);
  }
}
EOF
cat > project/project.service.ts <<'EOF'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';
import { UserRole, ProjectStatus } from '../common/Enums/index.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectQueryDto } from './dto/project-query.dto.js';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto, currentUser: currentUserDto, file?: Express.Multer.File) {
    try {
      if (currentUser.role !== UserRole.CLIENT) {
        throw new ForbiddenException('Only clients can publish projects');
      }

      await this.checkCategory(dto.categoryId);

      return await this.prisma.project.create({
        data: {
          clientId: currentUser.userId,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          budget: dto.budget,
          ...(file && {
            attachmentUrl: `/uploads/projects/${file.filename}`,
            attachmentName: file.originalname,
            attachmentMime: file.mimetype,
            attachmentSize: file.size,
          }),
        },
        include: this.projectInclude(),
      });
    } catch (error) {
      await this.removeUploadedFile(file);
      throw error;
    }
  }

  async findAll(query: ProjectQueryDto) {
    const { page = 1, limit = 10, search, categoryId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = {
      status: ProjectStatus.OPEN,
      ...(categoryId && { categoryId }),
      ...(search && {
        title: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: this.projectInclude(),
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findMine(query: ProjectQueryDto, currentUser: currentUserDto) {
    if (currentUser.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Only clients have projects');
    }

    const { page = 1, limit = 10, search, categoryId, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = {
      clientId: currentUser.userId,
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(search && {
        title: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          ...this.projectInclude(),
          _count: { select: { proposals: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: this.projectInclude(),
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, currentUser: currentUserDto, file?: Express.Multer.File) {
    try {
      const project = await this.getOwnedOpenProject(id, currentUser);

      if (dto.categoryId !== undefined) {
        await this.checkCategory(dto.categoryId);
      }

      // The status condition is repeated in the update itself, so a proposal
      // accepted at the same moment cannot be overtaken by this edit.
      const updated = await this.prisma.project.updateMany({
        where: { id, clientId: currentUser.userId, status: ProjectStatus.OPEN },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.budget !== undefined && { budget: dto.budget }),
          ...(file && {
            attachmentUrl: `/uploads/projects/${file.filename}`,
            attachmentName: file.originalname,
            attachmentMime: file.mimetype,
            attachmentSize: file.size,
          }),
        },
      });

      if (updated.count === 0) {
        throw new ConflictException('Only open projects can be edited');
      }

      // Delete the previous attachment only after the database update succeeded.
      if (file && project.attachmentUrl) {
        await this.removeAttachment(project.attachmentUrl);
      }

      return await this.findOne(id);
    } catch (error) {
      await this.removeUploadedFile(file);
      throw error;
    }
  }

  async remove(id: string, currentUser: currentUserDto) {
    const project = await this.getOwnedOpenProject(id, currentUser);

    // Proposals of an open project are deleted with it (onDelete: Cascade).
    const deleted = await this.prisma.project.deleteMany({
      where: { id, clientId: currentUser.userId, status: ProjectStatus.OPEN },
    });

    if (deleted.count === 0) {
      throw new ConflictException('Only open projects can be deleted');
    }

    await this.removeAttachment(project.attachmentUrl);

    return { message: 'Project deleted successfully' };
  }

  private projectInclude() {
    return {
      category: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    };
  }

  private async checkCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  private async getOwnedOpenProject(id: string, currentUser: currentUserDto) {
    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.clientId !== currentUser.userId) {
      throw new ForbiddenException('You can only manage your own projects');
    }

    if (project.status !== ProjectStatus.OPEN) {
      throw new ConflictException('Only open projects can be edited or deleted');
    }

    return project;
  }

  private async removeUploadedFile(file?: Express.Multer.File): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {}
  }

  private async removeAttachment(attachmentUrl?: string | null): Promise<void> {
    if (!attachmentUrl?.startsWith('/uploads/projects/')) return;

    const filename = basename(attachmentUrl);
    if (!filename || filename === '.' || filename === '..') return;

    try {
      await unlink(resolve(process.cwd(), 'uploads', 'projects', filename));
    } catch {}
  }
}
EOF
# ---------------- proposal ----------------
cat > proposal/dto/create-proposal.dto.ts <<'EOF'
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProposalDto {
  @IsUUID()
  projectId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000000)
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message: string;
}
EOF
cat > proposal/dto/proposal-query.dto.ts <<'EOF'
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ProposalStatus } from '../../common/Enums/index.js';

export class ProposalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsIn(Object.values(ProposalStatus))
  status?: ProposalStatus;

  @IsOptional()
  @IsIn(['createdAt', 'price'])
  sortBy: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
EOF
cat > proposal/proposal.module.ts <<'EOF'
import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service.js';
import { ProposalController } from './proposal.controller.js';

@Module({
  controllers: [ProposalController],
  providers: [ProposalService],
})
export class ProposalModule {}
EOF
cat > proposal/proposal.controller.ts <<'EOF'
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProposalService } from './proposal.service.js';
import { CreateProposalDto } from './dto/create-proposal.dto.js';
import { ProposalQueryDto } from './dto/proposal-query.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('proposal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  @Post()
  @Roles(UserRole.FREELANCER)
  create(@Body() dto: CreateProposalDto, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.create(dto, currentUser);
  }

  @Get('mine')
  @Roles(UserRole.FREELANCER)
  findMine(@Query() query: ProposalQueryDto, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.findMine(query, currentUser);
  }

  @Get('project/:projectId')
  @Roles(UserRole.CLIENT)
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProposalQueryDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.proposalService.findByProject(projectId, query, currentUser);
  }

  @Patch(':id/accept')
  @Roles(UserRole.CLIENT)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.accept(id, currentUser);
  }
}
EOF
cat > proposal/proposal.service.ts <<'EOF'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';
import { UserRole, ProjectStatus, ProposalStatus, TransactionType } from '../common/Enums/index.js';
import { CreateProposalDto } from './dto/create-proposal.dto.js';
import { ProposalQueryDto } from './dto/proposal-query.dto.js';

@Injectable()
export class ProposalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProposalDto, currentUser: currentUserDto) {
    if (currentUser.role !== UserRole.FREELANCER) {
      throw new ForbiddenException('Only freelancers can submit proposals');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // FOR SHARE locks the project row until this transaction ends.
        // If the client accepts another proposal at the same moment, one of the
        // two waits for the other, so a proposal can never land on a project
        // that has just stopped being open.
        const open = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "projects"
          WHERE id = ${dto.projectId}::uuid AND status = 'OPEN'
          FOR SHARE
        `;

        if (open.length === 0) {
          const exists = await tx.project.findUnique({
            where: { id: dto.projectId },
            select: { id: true },
          });

          if (!exists) {
            throw new NotFoundException('Project not found');
          }

          throw new ConflictException('Proposals can only be submitted on open projects');
        }

        return tx.proposal.create({
          data: {
            projectId: dto.projectId,
            freelancerId: currentUser.userId,
            price: dto.price,
            durationDays: dto.durationDays,
            message: dto.message,
          },
          include: {
            project: { select: { id: true, title: true } },
          },
        });
      });
    } catch (error) {
      // @@unique([projectId, freelancerId]): one proposal per project, even on a double click.
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('You have already submitted a proposal for this project');
      }
      throw error;
    }
  }

  async findMine(query: ProposalQueryDto, currentUser: currentUserDto) {
    if (currentUser.role !== UserRole.FREELANCER) {
      throw new ForbiddenException('Only freelancers have proposals');
    }

    const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = {
      freelancerId: currentUser.userId,
      ...(status && { status }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          project: {
            select: { id: true, title: true, budget: true, status: true },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findByProject(projectId: string, query: ProposalQueryDto, currentUser: currentUserDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.clientId !== currentUser.userId) {
      throw new ForbiddenException('You can only see proposals on your own projects');
    }

    const { page = 1, limit = 10, status, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      ...(status && { status }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          freelancer: {
            select: {
              id: true,
              name: true,
              freelancerProfile: {
                select: { hourlyRate: true, avatarUrl: true },
              },
            },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  // Accepting a proposal: every step happens in one transaction, or none of them does.
  async accept(id: string, currentUser: currentUserDto) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, clientId: true } },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.project.clientId !== currentUser.userId) {
      throw new ForbiddenException('You can only accept proposals on your own projects');
    }

    const price = proposal.price;

    return this.prisma.$transaction(async (tx) => {
      // 1. The project must still be open. Two clicks (or two devices) at the same
      //    time: only one UPDATE matches, the other gets count = 0.
      const project = await tx.project.updateMany({
        where: {
          id: proposal.projectId,
          clientId: currentUser.userId,
          status: ProjectStatus.OPEN,
        },
        data: { status: ProjectStatus.IN_PROGRESS },
      });

      if (project.count === 0) {
        throw new ConflictException('This project is no longer open');
      }

      // 2. The chosen proposal becomes accepted.
      const accepted = await tx.proposal.updateMany({
        where: { id, status: ProposalStatus.PENDING },
        data: { status: ProposalStatus.ACCEPTED },
      });

      if (accepted.count === 0) {
        throw new ConflictException('This proposal is not pending');
      }

      // 3. All the other proposals on the project are rejected.
      await tx.proposal.updateMany({
        where: {
          projectId: proposal.projectId,
          id: { not: id },
          status: ProposalStatus.PENDING,
        },
        data: { status: ProposalStatus.REJECTED },
      });

      // 4. Move the money from available to held. The balance condition is part of
      //    the UPDATE, so the wallet can never go below zero.
      const held = await tx.wallet.updateMany({
        where: {
          userId: currentUser.userId,
          availableBalance: { gte: price },
        },
        data: {
          availableBalance: { decrement: price },
          heldBalance: { increment: price },
        },
      });

      if (held.count === 0) {
        throw new BadRequestException('Insufficient balance, please top up your wallet');
      }

      // 5. Ledger record.
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: currentUser.userId },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          projectId: proposal.projectId,
          type: TransactionType.HOLD,
          amount: price,
          balanceAfter: wallet.availableBalance,
        },
      });

      return tx.proposal.findUniqueOrThrow({
        where: { id },
        include: {
          project: { select: { id: true, title: true, status: true } },
        },
      });
    });
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
echo ok
Output

ok
