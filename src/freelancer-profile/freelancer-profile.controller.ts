import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FreelancerProfileService } from './freelancer-profile.service.js';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto.js';
import { avatarMulterOptions } from './avatar.multer.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('freelancer-profile')
export class FreelancerProfileController {
  constructor(private readonly profileService: FreelancerProfileService) {}

  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FREELANCER)
  updateMyProfile(
    @Body() dto: UpdateFreelancerProfileDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.profileService.updateMyProfile(dto, currentUser);
  }

  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FREELANCER)
  @UseInterceptors(FileInterceptor('avatar', avatarMulterOptions))
  updateAvatar(
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar image is required');
    }
    return this.profileService.updateAvatar(file, currentUser);
  }

  // Anyone can open the profile of any freelancer, no token needed.
  @Get(':userId')
  findOne(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.profileService.findOne(userId);
  }
}
