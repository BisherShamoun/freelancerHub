import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import express from 'express';
import { DeliveryService } from './delivery.service.js';
import { deliveryMulterOptions } from './delivery.multer.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post('project/:projectId')
  @Roles(UserRole.FREELANCER)
  @UseInterceptors(FileInterceptor('file', deliveryMulterOptions))
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('A PDF or ZIP file is required');
    }
    return this.deliveryService.create(projectId, file, currentUser);
  }

  @Get('project/:projectId')
  @Roles(UserRole.CLIENT, UserRole.FREELANCER, UserRole.ADMIN)
  findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.deliveryService.findOne(projectId, currentUser);
  }

  // Private file: only the two sides of the project (and the admin) can download it.
  @Get('project/:projectId/file')
  @Roles(UserRole.CLIENT, UserRole.FREELANCER, UserRole.ADMIN)
  async downloadFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() currentUser: currentUserDto,
    @Res() response: express.Response,
  ) {
    const file = await this.deliveryService.getFile(projectId, currentUser);

    return response.download(file.fullPath, file.filename);
  }

  @Patch('project/:projectId/approve')
  @Roles(UserRole.CLIENT)
  approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.deliveryService.approve(projectId, currentUser);
  }
}
