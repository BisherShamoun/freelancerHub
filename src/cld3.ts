// cd /home/claude/freelancehub &&
// cat > src/delivery/delivery.multer.ts <<'EOF'
// import { BadRequestException } from '@nestjs/common';
// import { diskStorage } from 'multer';
// import { mkdirSync } from 'node:fs';
// import { extname, resolve } from 'node:path';
// import { randomUUID } from 'node:crypto';
// import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// // Outside "uploads": that folder is served as static files, delivery files must stay private.
// export const deliveryUploadDir = resolve(process.cwd(), 'storage', 'private', 'deliveries');

// mkdirSync(deliveryUploadDir, { recursive: true });

// const allowedExtensions = ['.pdf', '.zip'];
// const allowedMimeTypes = [
//   'application/pdf',
//   'application/zip',
//   'application/x-zip-compressed',
//   'application/octet-stream',
// ];

// export const deliveryMulterOptions: MulterOptions = {
//   storage: diskStorage({
//     destination: deliveryUploadDir,
//     filename: (_req, file, callback) => {
//       callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
//     },
//   }),

//   fileFilter: (_req, file, callback) => {
//     const extension = extname(file.originalname).toLowerCase();

//     if (!allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.mimetype)) {
//       return callback(
//         new BadRequestException('Only PDF or ZIP files are allowed'),
//         false,
//       );
//     }

//     callback(null, true);
//   },

//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10 MB
//     files: 1,
//   },
// };
// EOF
// cat > src/delivery/delivery.module.ts <<'EOF'
// import { Module } from '@nestjs/common';
// import { DeliveryService } from './delivery.service.js';
// import { DeliveryController } from './delivery.controller.js';

// @Module({
//   controllers: [DeliveryController],
//   providers: [DeliveryService],
// })
// export class DeliveryModule {}
// EOF
// cat > src/delivery/delivery.controller.ts <<'EOF'
// import {
//   BadRequestException,
//   Controller,
//   Get,
//   Param,
//   ParseUUIDPipe,
//   Patch,
//   Post,
//   Res,
//   UploadedFile,
//   UseGuards,
//   UseInterceptors,
// } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import express from 'express';
// import { DeliveryService } from './delivery.service.js';
// import { deliveryMulterOptions } from './delivery.multer.js';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// import { RolesGuard } from '../common/guards/roles.guard.js';
// import { Roles } from '../common/decorators/roles.decorator.js';
// import { CurrentUser } from '../common/decorators/index.js';
// import { UserRole } from '../common/Enums/index.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';

// @Controller('delivery')
// @UseGuards(JwtAuthGuard, RolesGuard)
// export class DeliveryController {
//   constructor(private readonly deliveryService: DeliveryService) {}

//   @Post('project/:projectId')
//   @Roles(UserRole.FREELANCER)
//   @UseInterceptors(FileInterceptor('file', deliveryMulterOptions))
//   create(
//     @Param('projectId', ParseUUIDPipe) projectId: string,
//     @CurrentUser() currentUser: currentUserDto,
//     @UploadedFile() file?: Express.Multer.File,
//   ) {
//     if (!file) {
//       throw new BadRequestException('A PDF or ZIP file is required');
//     }
//     return this.deliveryService.create(projectId, file, currentUser);
//   }

//   @Get('project/:projectId')
//   @Roles(UserRole.CLIENT, UserRole.FREELANCER, UserRole.ADMIN)
//   findOne(
//     @Param('projectId', ParseUUIDPipe) projectId: string,
//     @CurrentUser() currentUser: currentUserDto,
//   ) {
//     return this.deliveryService.findOne(projectId, currentUser);
//   }

//   // Private file: only the two sides of the project (and the admin) can download it.
//   @Get('project/:projectId/file')
//   @Roles(UserRole.CLIENT, UserRole.FREELANCER, UserRole.ADMIN)
//   async downloadFile(
//     @Param('projectId', ParseUUIDPipe) projectId: string,
//     @CurrentUser() currentUser: currentUserDto,
//     @Res() response: express.Response,
//   ) {
//     const file = await this.deliveryService.getFile(projectId, currentUser);

//     return response.download(file.fullPath, file.filename);
//   }

//   @Patch('project/:projectId/approve')
//   @Roles(UserRole.CLIENT)
//   approve(
//     @Param('projectId', ParseUUIDPipe) projectId: string,
//     @CurrentUser() currentUser: currentUserDto,
//   ) {
//     return this.deliveryService.approve(projectId, currentUser);
//   }
// }
// EOF
// cat > src/delivery/delivery.service.ts <<'EOF'
// import {
//   ConflictException,
//   ForbiddenException,
//   Injectable,
//   InternalServerErrorException,
//   NotFoundException,
// } from '@nestjs/common';
// import { promises as fs } from 'node:fs';
// import * as path from 'node:path';
// import { PrismaService } from '../prisma/prisma.service.js';
// import { Prisma } from '../generated/prisma/client.js';
// import { currentUserDto } from '../user/dto/currentUserDto.js';
// import { UserRole, ProjectStatus, ProposalStatus, TransactionType } from '../common/Enums/index.js';
// import { COMMISSION_RATE } from '../common/constants/index.js';
// import { deliveryUploadDir } from './delivery.multer.js';

// @Injectable()
// export class DeliveryService {
//   constructor(private readonly prisma: PrismaService) {}

//   async create(projectId: string, file: Express.Multer.File, currentUser: currentUserDto) {
//     try {
//       if (currentUser.role !== UserRole.FREELANCER) {
//         throw new ForbiddenException('Only the freelancer of the project can upload a delivery');
//       }

//       const project = await this.getProject(projectId);
//       const accepted = project.proposals[0];

//       if (!accepted || accepted.freelancerId !== currentUser.userId) {
//         throw new ForbiddenException('You are not the freelancer of this project');
//       }

//       if (project.status !== ProjectStatus.IN_PROGRESS) {
//         throw new ConflictException('This project is not in progress');
//       }

//       const delivery = await this.prisma.delivery.create({
//         data: {
//           projectId,
//           filePath: path.join('storage', 'private', 'deliveries', file.filename),
//           fileName: file.originalname,
//           sizeBytes: file.size,
//         },
//       });

//       const { filePath, ...safeDelivery } = delivery;
//       return safeDelivery;
//     } catch (error) {
//       await this.removeUploadedFile(file);

//       // @unique(projectId): one delivery per project.
//       if (this.isPrismaError(error, 'P2002')) {
//         throw new ConflictException('A delivery was already uploaded for this project');
//       }
//       throw error;
//     }
//   }

//   async findOne(projectId: string, currentUser: currentUserDto) {
//     const project = await this.getProject(projectId);
//     this.checkAccess(project, currentUser);

//     const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

//     if (!delivery) {
//       throw new NotFoundException('No delivery has been uploaded yet');
//     }

//     const { filePath, ...safeDelivery } = delivery;
//     return safeDelivery;
//   }

//   async getFile(projectId: string, currentUser: currentUserDto) {
//     const project = await this.getProject(projectId);
//     this.checkAccess(project, currentUser);

//     const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

//     if (!delivery) {
//       throw new NotFoundException('No delivery has been uploaded yet');
//     }

//     const fullPath = path.resolve(process.cwd(), delivery.filePath);

//     // The file must be inside the deliveries folder.
//     if (!fullPath.startsWith(deliveryUploadDir + path.sep)) {
//       throw new ForbiddenException('Invalid file path');
//     }

//     try {
//       await fs.access(fullPath);
//     } catch {
//       throw new NotFoundException('Delivery file not found');
//     }

//     return { fullPath, filename: delivery.fileName };
//   }

//   // Approving the delivery pays the freelancer: 90% to him, 10% to the platform.
//   // Everything happens in one transaction, and the guards inside make a double
//   // click harmless: the second request finds approvedAt already set.
//   async approve(projectId: string, currentUser: currentUserDto) {
//     const project = await this.getProject(projectId);

//     if (project.clientId !== currentUser.userId) {
//       throw new ForbiddenException('You can only approve deliveries of your own projects');
//     }

//     const accepted = project.proposals[0];

//     if (!accepted) {
//       throw new ConflictException('This project has no accepted proposal');
//     }

//     const delivery = await this.prisma.delivery.findUnique({ where: { projectId } });

//     if (!delivery) {
//       throw new NotFoundException('No delivery has been uploaded yet');
//     }

//     if (delivery.approvedAt) {
//       throw new ConflictException('This delivery is already approved');
//     }

//     const price = accepted.price;
//     const commission = price.mul(COMMISSION_RATE).toDecimalPlaces(2);
//     const payout = price.sub(commission);

//     return this.prisma.$transaction(async (tx) => {
//       const approved = await tx.delivery.updateMany({
//         where: { projectId, approvedAt: null },
//         data: { approvedAt: new Date() },
//       });

//       if (approved.count === 0) {
//         throw new ConflictException('This delivery is already approved');
//       }

//       const completed = await tx.project.updateMany({
//         where: { id: projectId, status: ProjectStatus.IN_PROGRESS },
//         data: { status: ProjectStatus.COMPLETED },
//       });

//       if (completed.count === 0) {
//         throw new ConflictException('This project is not in progress');
//       }

//       // The money leaves the held balance of the client...
//       const released = await tx.wallet.updateMany({
//         where: { userId: project.clientId, heldBalance: { gte: price } },
//         data: { heldBalance: { decrement: price } },
//       });

//       if (released.count === 0) {
//         throw new ConflictException('Held balance does not cover this project');
//       }

//       // ...and reaches the freelancer and the platform, nowhere else.
//       const platformOwner = await tx.wallet.findFirst({
//         where: { user: { role: UserRole.ADMIN } },
//         orderBy: { user: { createdAt: 'asc' } },
//         select: { id: true },
//       });

//       if (!platformOwner) {
//         throw new InternalServerErrorException('Platform wallet not found, run the seed');
//       }

//       const freelancerWallet = await tx.wallet.update({
//         where: { userId: accepted.freelancerId },
//         data: { availableBalance: { increment: payout } },
//       });

//       const platformWallet = await tx.wallet.update({
//         where: { id: platformOwner.id },
//         data: { availableBalance: { increment: commission } },
//       });

//       await tx.walletTransaction.createMany({
//         data: [
//           {
//             walletId: freelancerWallet.id,
//             projectId,
//             type: TransactionType.PAYOUT,
//             amount: payout,
//             balanceAfter: freelancerWallet.availableBalance,
//           },
//           {
//             walletId: platformWallet.id,
//             projectId,
//             type: TransactionType.COMMISSION,
//             amount: commission,
//             balanceAfter: platformWallet.availableBalance,
//           },
//         ],
//       });

//       return {
//         message: 'Delivery approved and payment released',
//         projectId,
//         total: price,
//         paidToFreelancer: payout,
//         platformCommission: commission,
//       };
//     });
//   }

//   private async getProject(projectId: string) {
//     const project = await this.prisma.project.findUnique({
//       where: { id: projectId },
//       select: {
//         id: true,
//         clientId: true,
//         status: true,
//         proposals: {
//           where: { status: ProposalStatus.ACCEPTED },
//           select: { id: true, freelancerId: true, price: true },
//         },
//       },
//     });

//     if (!project) {
//       throw new NotFoundException('Project not found');
//     }

//     return project;
//   }

//   private checkAccess(
//     project: { clientId: string; proposals: { freelancerId: string }[] },
//     currentUser: currentUserDto,
//   ) {
//     const isAdmin = currentUser.role === UserRole.ADMIN;
//     const isClient = project.clientId === currentUser.userId;
//     const isFreelancer = project.proposals[0]?.freelancerId === currentUser.userId;

//     if (!isAdmin && !isClient && !isFreelancer) {
//       throw new ForbiddenException('You cannot access the delivery of this project');
//     }
//   }

//   private async removeUploadedFile(file?: Express.Multer.File): Promise<void> {
//     if (!file?.path) return;
//     try {
//       await fs.unlink(file.path);
//     } catch {}
//   }

//   private isPrismaError(error: unknown, code: string): boolean {
//     return (
//       typeof error === 'object' &&
//       error !== null &&
//       'code' in error &&
//       error.code === code
//     );
//   }
// }
// EOF
// cat > prisma/seed.ts <<'EOF'
// import 'dotenv/config';
// import { Pool } from 'pg';
// import { PrismaPg } from '@prisma/adapter-pg';
// import * as bcrypt from 'bcrypt';
// import { PrismaClient } from '../src/generated/prisma/client.js';
// import { UserRole } from '../src/common/Enums/index.js';

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });

// const adapter = new PrismaPg(pool);
// const prisma = new PrismaClient({ adapter });

// async function main() {
//   const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
//   const password = process.env.ADMIN_PASSWORD;

//   if (!email || !password) {
//     throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD is missing');
//   }

//   const passwordHash = await bcrypt.hash(password, 10);

//   // The admin never comes from registration. His wallet is the platform wallet:
//   // the 10% commission of every approved delivery is credited to it.
//   const admin = await prisma.user.upsert({
//     where: { email },
//     update: { role: UserRole.ADMIN },
//     create: {
//       name: 'Admin',
//       email,
//       password: passwordHash,
//       role: UserRole.ADMIN,
//     },
//     omit: { password: true },
//   });

//   await prisma.wallet.upsert({
//     where: { userId: admin.id },
//     update: {},
//     create: { userId: admin.id },
//   });

//   await prisma.category.createMany({
//     data: [
//       { name: 'Programming' },
//       { name: 'Design' },
//       { name: 'Translation' },
//       { name: 'Marketing' },
//     ],
//     skipDuplicates: true,
//   });

//   console.log('Admin account ready:', admin);
//   console.log('Categories ready');
// }

// main()
//   .catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//     await pool.end();
//   });
// EOF
// npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
// Output

// exit code 0
