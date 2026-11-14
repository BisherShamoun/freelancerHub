import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from './dto/currentUserDto.js';
import { UserQueryDto } from './dto/user-query-dto.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @Patch(':id/ban')
  ban(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.userService.ban(id, currentUser);
  }

  @Patch(':id/unban')
  unban(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.unban(id);
  }
}
