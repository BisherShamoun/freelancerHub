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
