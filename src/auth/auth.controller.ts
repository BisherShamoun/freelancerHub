
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { LoginDto } from './dto/LoginDto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/index.js';

interface AuthenticatedUser {
  userId: string;
  sid: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: CreateAuthDto) {
    return this.authService.register(body);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(body, userAgent);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.logout(currentUser.userId, currentUser.sid);
  }

  @Post('logout-others')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutOthers(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.authService.logoutOthers(currentUser.userId, currentUser.sid);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser('userId') id: string) {
    return this.authService.getMyProfile(id);
  }
}
