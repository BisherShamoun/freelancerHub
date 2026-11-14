import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

const CATEGORIES_KEY = 'categories:all';
// The list almost never changes, so it can stay in the cache for an hour.
// Any change made by the admin deletes the key at once.
const CATEGORIES_TTL = 60 * 60 * 1000;

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async findAll() {
    const cached = await this.cache.get<any>(CATEGORIES_KEY);

    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    await this.cache.set(CATEGORIES_KEY, categories, CATEGORIES_TTL);

    return categories;
  }

  async create(dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.category.create({
        data: { name: dto.name },
      });
      await this.cache.del(CATEGORIES_KEY);
      return category;
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Category already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getCategory(id);

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
        },
      });
      await this.cache.del(CATEGORIES_KEY);
      return category;
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Category already exists');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.getCategory(id);

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      // A category that still has projects cannot be deleted.
      if (this.isPrismaError(error, 'P2003')) {
        throw new ConflictException('Cannot delete a category that has projects');
      }
      throw error;
    }

    await this.cache.del(CATEGORIES_KEY);

    return { message: 'Category deleted successfully' };
  }

  private async getCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
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
