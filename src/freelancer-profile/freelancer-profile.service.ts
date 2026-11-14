import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';
import { UserRole } from '../common/Enums/index.js';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto.js';

@Injectable()
export class FreelancerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(userId: string) {
    const profile = await this.prisma.freelancerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Freelancer profile not found');
    }

    return profile;
  }

  async updateMyProfile(dto: UpdateFreelancerProfileDto, currentUser: currentUserDto) {
    if (currentUser.role !== UserRole.FREELANCER) {
      throw new ForbiddenException('Only freelancers have a profile');
    }

    return this.prisma.freelancerProfile.update({
      where: { userId: currentUser.userId },
      data: {
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
      },
    });
  }

  async updateAvatar(file: Express.Multer.File, currentUser: currentUserDto) {
    try {
      if (currentUser.role !== UserRole.FREELANCER) {
        throw new ForbiddenException('Only freelancers have a profile');
      }

      const profile = await this.prisma.freelancerProfile.findUnique({
        where: { userId: currentUser.userId },
      });

      if (!profile) {
        throw new NotFoundException('Freelancer profile not found');
      }

      const updated = await this.prisma.freelancerProfile.update({
        where: { userId: currentUser.userId },
        data: { avatarUrl: `/uploads/avatars/${file.filename}` },
      });

      // Delete the previous photo only after the database update succeeded.
      await this.removeAvatar(profile.avatarUrl);

      return updated;
    } catch (error) {
      await this.removeUploadedFile(file);
      throw error;
    }
  }

  private async removeUploadedFile(file?: Express.Multer.File): Promise<void> {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {}
  }

  private async removeAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) return;

    const filename = basename(avatarUrl);
    if (!filename || filename === '.' || filename === '..') return;

    try {
      await unlink(resolve(process.cwd(), 'uploads', 'avatars', filename));
    } catch {}
  }
}
