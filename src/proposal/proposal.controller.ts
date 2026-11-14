import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProposalService } from './proposal.service.js';
import { CreateProposalDto } from './dto/create-proposal.dto.js';
import { ProposalQueryDto } from './dto/proposal-query.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/index.js';
import { UserRole } from '../common/Enums/index.js';
import { currentUserDto } from '../user/dto/currentUserDto.js';

@Controller('proposal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  @Post()
  @Roles(UserRole.FREELANCER)
  create(@Body() dto: CreateProposalDto, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.create(dto, currentUser);
  }

  @Get('mine')
  @Roles(UserRole.FREELANCER)
  findMine(@Query() query: ProposalQueryDto, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.findMine(query, currentUser);
  }

  @Get('project/:projectId')
  @Roles(UserRole.CLIENT)
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProposalQueryDto,
    @CurrentUser() currentUser: currentUserDto,
  ) {
    return this.proposalService.findByProject(projectId, query, currentUser);
  }

  @Patch(':id/accept')
  @Roles(UserRole.CLIENT)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: currentUserDto) {
    return this.proposalService.accept(id, currentUser);
  }
}
