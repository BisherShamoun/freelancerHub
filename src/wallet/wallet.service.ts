import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';
import { UserRole, TransactionType } from '../common/Enums/index.js';
import { DepositDto } from './dto/deposit.dto.js';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyWallet(currentUser: currentUserDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: currentUser.userId },
      select: {
        id: true,
        availableBalance: true,
        heldBalance: true,
        updatedAt: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getMyTransactions(query: WalletTransactionQueryDto, currentUser: currentUserDto) {
    const { page = 1, limit = 10, type } = query;
    const skip = (page - 1) * limit;

    const where = {
      wallet: { userId: currentUser.userId },
      ...(type && { type }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, title: true },
          },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
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

  // No real payment gateway in this version: the amount is simply added.
  async deposit(dto: DepositDto, currentUser: currentUserDto) {
    if (currentUser.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Only clients can top up their wallet');
    }

    const amount = new Prisma.Decimal(dto.amount);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId: currentUser.userId },
        data: { availableBalance: { increment: amount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          amount,
          balanceAfter: wallet.availableBalance,
        },
      });

      return {
        message: 'Wallet topped up successfully',
        availableBalance: wallet.availableBalance,
        heldBalance: wallet.heldBalance,
      };
    });
  }
}
