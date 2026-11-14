import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { DepositDto } from './dto/deposit.dto.js';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getMyWallet(@CurrentUser() currentUser: currentUserDto) {
    return this.walletService.getMyWallet(currentUser);
  }

  @Get('transactions')
  getMyTransactions(
    @Query() query: WalletTransactionQueryDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.walletService.getMyTransactions(query, currentUser);
  }

  @Post('deposit')
  @Roles(UserRole.CLIENT)
  deposit(@Body() dto: DepositDto, @CurrentUser() currentUser: currentUserDto) {
    return this.walletService.deposit(dto, currentUser);
  }
}
