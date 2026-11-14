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
