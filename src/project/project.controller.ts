import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectService } from './project.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { ProjectQueryDto } from './dto/project-query.dto.js';
import { projectMulterOptions } from './project.multer.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('attachment', projectMulterOptions))
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projectService.create(dto, currentUser, file);
  }

  // Browse page: open projects, paginated, with filters and sorting.
  @Get()
  findAll(@Query() query: ProjectQueryDto) {
    return this.projectService.findAll(query);
  }

  // Must stay above ':id' so that "mine" is not read as an id.
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  findMine(
    @Query() query: ProjectQueryDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.projectService.findMine(query, currentUser);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @UseInterceptors(FileInterceptor('attachment', projectMulterOptions))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() currentUser: currentUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projectService.update(id, dto, currentUser, file);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.projectService.remove(id, currentUser);
  }
}
