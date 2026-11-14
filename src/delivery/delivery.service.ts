import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';
import { UserRole, ProjectStatus, ProposalStatus, TransactionType } from '../common/Enums/index.js';
import { COMMISSION_RATE } from '../common/constants/index.js';
import { deliveryUploadDir } from './delivery.multer.js';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, file: Express.Multer.File, currentUser: currentUserDto) {
    try {
      if (currentUser.role !== UserRole.FREELANCER) {
        throw new ForbiddenException('Only the freelancer of the project can upload a delivery');
      }

      const project = await this.getProject(projectId);
      const accepted = project.proposals[0];

      if (!accepted || accepted.freelancerId !== currentUser.userId) {
        throw new ForbiddenException('You are not the freelancer of this project');
      }

      if (project.status !== ProjectStatus.IN_PROGRESS) {
        throw new ConflictException('This project is not in progress');
      }

      const delivery = await this.prisma.delivery.create({
        data: {
          projectId,
          filePath: path.join('storage', 'private', 'deliveries', file.filename),
          fileName: file.originalname,
          sizeBytes: file.size,
        },
      });

      const { filePath, ...safeDelivery } = delivery;
      return safeDelivery;
    } catch (error) {
      await this.removeUploadedFile(file);

      // @unique(projectId): one delivery per project.
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('A delivery was already uploaded for this project');
      }
      throw error;
    }
  }

  async findOne(projectId: string, currentUser: currentUserDto) {
    const project = await this.getProject(projectId);
    this.checkAccess(project, currentUser);

    const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

    if (!delivery) {
      throw new NotFoundException('No delivery has been uploaded yet');
    }

    const { filePath, ...safeDelivery } = delivery;
    return safeDelivery;
  }

  async getFile(projectId: string, currentUser: currentUserDto) {
    const project = await this.getProject(projectId);
    this.checkAccess(project, currentUser);

    const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

    if (!delivery) {
      throw new NotFoundException('No delivery has been uploaded yet');
    }

    const fullPath = path.resolve(process.cwd(), delivery.filePath);

    // The file must be inside the deliveries folder.
    if (!fullPath.startsWith(deliveryUploadDir + path.sep)) {
      throw new ForbiddenException('Invalid file path');
    }

    try {
      await fs.access(fullPath);
    } catch {
      throw new NotFoundException('Delivery file not found');
    }

    return { fullPath, filename: delivery.fileName };
  }

  // Approving the delivery pays the freelancer: 90% to him, 10% to the platform.
  // Everything happens in one transaction, and the guards inside make a double
  // click harmless: the second request finds approvedAt already set.
  async approve(projectId: string, currentUser: currentUserDto) {
    const project = await this.getProject(projectId);

    if (project.clientId !== currentUser.userId) {
      throw new ForbiddenException('You can only approve deliveries of your own projects');
    }

    const accepted = project.proposals[0];

    if (!accepted) {
      throw new ConflictException('This project has no accepted proposal');
    }

    const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

    if (!delivery) {
      throw new NotFoundException('No delivery has been uploaded yet');
    }

    if (delivery.approvedAt) {
      throw new ConflictException('This delivery is already approved');
    }

    const price = accepted.price;
    const commission = price.mul(COMMISSION_RATE).toDecimalPlaces(2);
    const payout = price.sub(commission);

    return this.prisma.$transaction(async (tx) => {
      const approved = await tx.delivery.updateMany({
        where: { projectId, approvedAt: null },
        data: { approvedAt: new Date() },
      });

      if (approved.count === 0) {
        throw new ConflictException('This delivery is already approved');
      }

      const completed = await tx.project.updateMany({
        where: { id: projectId, status: ProjectStatus.IN_PROGRESS },
        data: { status: ProjectStatus.COMPLETED },
      });

      if (completed.count === 0) {
        throw new ConflictException('This project is not in progress');
      }

      // The money leaves the held balance of the client...
      const released = await tx.wallet.updateMany({
        where: { userId: project.clientId, heldBalance: { gte: price } },
        data: { heldBalance: { decrement: price } },
      });

      if (released.count === 0) {
        throw new ConflictException('Held balance does not cover this project');
      }

      // ...and reaches the freelancer and the platform, nowhere else.
      const platformOwner = await tx.wallet.findFirst({
        where: { user: { role: UserRole.ADMIN } },
        orderBy: { user: { createdAt: 'asc' } },
        select: { id: true },
      });

      if (!platformOwner) {
        throw new InternalServerErrorException('Platform wallet not found, run the seed');
      }

      const freelancerWallet = await tx.wallet.update({
        where: { userId: accepted.freelancerId },
        data: { availableBalance: { increment: payout } },
      });

      const platformWallet = await tx.wallet.update({
        where: { id: platformOwner.id },
        data: { availableBalance: { increment: commission } },
      });

      await tx.walletTransaction.createMany({
        data: [
          {
            walletId: freelancerWallet.id,
            projectId,
            type: TransactionType.PAYOUT,
            amount: payout,
            balanceAfter: freelancerWallet.availableBalance,
          },
          {
            walletId: platformWallet.id,
            projectId,
            type: TransactionType.COMMISSION,
            amount: commission,
            balanceAfter: platformWallet.availableBalance,
          },
        ],
      });

      return {
        message: 'Delivery approved and payment released',
        projectId,
        total: price,
        paidToFreelancer: payout,
        platformCommission: commission,
      };
    });
  }

  private async getProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        clientId: true,
        status: true,
        proposals: {
          where: { status: ProposalStatus.ACCEPTED },
          select: { id: true, freelancerId: true, price: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private checkAccess(
    project: { clientId: string; proposals: { freelancerId: string }[] },
    currentUser: currentUserDto,
  ) {
    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isClient = project.clientId === currentUser.userId;
    const isFreelancer = project.proposals[0]?.freelancerId === currentUser.userId;

    if (!isAdmin && !isClient && !isFreelancer) {
      throw new ForbiddenException('You cannot access the delivery of this project');
    }
  }

  private async removeUploadedFile(file?: Express.Multer.File): Promise<void> {
    if (!file?.path) return;
    try {
      await fs.unlink(file.path);
    } catch {}
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
