// mkdir -p /home/claude/freelancehub && cd /home/claude/freelancehub && mkdir -p prisma src/{prisma,common/{Enums,decorators,guards,constants},auth/dto,user/dto,wallet/dto,freelancer-profile/dto,category/dto,project/dto,proposal/dto,delivery}
// cat > package.json <<'EOF'
// {
//   "name": "freelancehub",
//   "version": "0.0.1",
//   "description": "FreelanceHub backend (NestJS + Prisma + PostgreSQL)",
//   "private": true,
//   "license": "UNLICENSED",
//   "type": "module",
//   "scripts": {
//     "build": "nest build",
//     "format": "prettier --write \"src/**/*.ts\"",
//     "start": "nest start",
//     "start:dev": "nest start --watch",
//     "start:prod": "node dist/main",
//     "seed": "prisma db seed"
//   },
//   "dependencies": {
//     "@nestjs/cache-manager": "^12.0.2",
//     "@nestjs/common": "^12.0.1",
//     "@nestjs/config": "^12.0.1",
//     "@nestjs/core": "^12.0.1",
//     "@nestjs/jwt": "^12.0.3",
//     "@nestjs/mapped-types": "*",
//     "@nestjs/passport": "^12.0.0",
//     "@nestjs/platform-express": "^12.0.1",
//     "@nestjs/throttler": "^6.7.1",
//     "@prisma/adapter-pg": "^7.10.0",
//     "@prisma/client": "^7.10.0",
//     "bcrypt": "^6.0.0",
//     "cache-manager": "^7.2.9",
//     "class-transformer": "^0.5.1",
//     "class-validator": "^0.15.1",
//     "multer": "^2.5.0",
//     "passport": "^0.7.0",
//     "passport-jwt": "^4.0.1",
//     "pg": "^8.23.1",
//     "reflect-metadata": "^0.2.2",
//     "rxjs": "^7.8.1"
//   },
//   "devDependencies": {
//     "@nestjs/cli": "^12.0.0",
//     "@nestjs/schematics": "^12.0.0",
//     "@types/bcrypt": "^6.0.0",
//     "@types/express": "^5.0.6",
//     "@types/multer": "^2.3.0",
//     "@types/ms": "^2.1.0",
//     "@types/node": "^24.0.0",
//     "@types/passport-jwt": "^4.0.1",
//     "@types/pg": "^8.23.1",
//     "dotenv": "^18.0.9",
//     "prettier": "^3.4.2",
//     "prisma": "^7.10.0",
//     "source-map-support": "^0.5.21",
//     "tsx": "^4.23.15",
//     "typescript": "^6.0.2"
//   }
// }
// EOF
// cat > tsconfig.json <<'EOF'
// {
//   "compilerOptions": {
//     "module": "nodenext",
//     "moduleResolution": "nodenext",
//     "resolvePackageJsonExports": true,
//     "esModuleInterop": true,
//     "isolatedModules": true,
//     "declaration": true,
//     "removeComments": true,
//     "emitDecoratorMetadata": true,
//     "experimentalDecorators": true,
//     "allowSyntheticDefaultImports": true,
//     "target": "ES2023",
//     "sourceMap": true,
//     "outDir": "./dist",
//     "rootDir": ".",
//     "incremental": true,
//     "skipLibCheck": true,
//     "strict": true,
//     "strictPropertyInitialization": false,
//     "types": ["node"]
//   }
// }
// EOF
// cat > tsconfig.build.json <<'EOF'
// {
//   "extends": "./tsconfig.json",
//   "compilerOptions": {
//     "rootDir": "./src"
//   },
//   "include": ["src"],
//   "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
// }
// EOF
// cat > nest-cli.json <<'EOF'
// {
//   "$schema": "https://json.schemastore.org/nest-cli",
//   "collection": "@nestjs/schematics",
//   "sourceRoot": "src",
//   "compilerOptions": {
//     "deleteOutDir": true
//   }
// }
// EOF
// cat > prisma.config.ts <<'EOF'
// import 'dotenv/config';
// import { defineConfig } from 'prisma/config';

// export default defineConfig({
//   schema: 'prisma/schema.prisma',
//   migrations: {
//     path: 'prisma/migrations',
//     seed: 'tsx prisma/seed.ts',
//   },
//   datasource: {
//     url: process.env['DATABASE_URL'],
//   },
// });
// EOF
// cat > .env.example <<'EOF'
// DATABASE_URL="postgresql://postgres:your-password@localhost:5432/freelancehub"

// JWT_SECRET=
// JWT_EXPIRES_IN=7d

// ADMIN_EMAIL=
// ADMIN_PASSWORD=
// EOF
// cat > .gitignore <<'EOF'
// node_modules/
// dist/
// .env
// uploads/
// storage/
// src/generated/
// EOF
// cat > prisma/schema.prisma <<'EOF'
// // This is your Prisma schema file,
// // learn more about it in the docs: https://pris.ly/d/prisma-schema

// generator client {
//   provider = "prisma-client"
//   output   = "../src/generated/prisma"
// }

// datasource db {
//   provider = "postgresql"
// }

// enum Role {
//   ADMIN
//   CLIENT
//   FREELANCER
// }

// enum ProjectStatus {
//   OPEN
//   IN_PROGRESS
//   COMPLETED
// }

// enum ProposalStatus {
//   PENDING
//   ACCEPTED
//   REJECTED
// }

// enum TransactionType {
//   DEPOSIT
//   HOLD
//   PAYOUT
//   COMMISSION
// }

// model User {
//   id           String   @id @default(uuid()) @db.Uuid
//   name         String
//   email        String   @unique
//   password     String
//   role         Role     @default(CLIENT)
//   isBanned     Boolean  @default(false)
//   createdAt    DateTime @default(now())
//   updatedAt    DateTime @updatedAt

//   wallet            Wallet?
//   freelancerProfile FreelancerProfile?
//   projects          Project[]  @relation("ProjectClient")
//   proposals         Proposal[] @relation("ProposalFreelancer")

//   @@index([role, createdAt])
//   @@map("users")
// }

// model FreelancerProfile {
//   id         String   @id @default(uuid()) @db.Uuid
//   userId     String   @unique @db.Uuid
//   bio        String?  @db.Text
//   hourlyRate Decimal  @default(0) @db.Decimal(10, 2)
//   avatarUrl  String?
//   updatedAt  DateTime @updatedAt

//   user User @relation(fields: [userId], references: [id], onDelete: Cascade)

//   @@map("freelancer_profiles")
// }

// model Wallet {
//   id               String   @id @default(uuid()) @db.Uuid
//   userId           String   @unique @db.Uuid
//   availableBalance Decimal  @default(0) @db.Decimal(12, 2)
//   heldBalance      Decimal  @default(0) @db.Decimal(12, 2)
//   updatedAt        DateTime @updatedAt

//   user         User                @relation(fields: [userId], references: [id], onDelete: Restrict)
//   transactions WalletTransaction[]

//   @@map("wallets")
// }

// model WalletTransaction {
//   id           String          @id @default(uuid()) @db.Uuid
//   walletId     String          @db.Uuid
//   projectId    String?         @db.Uuid
//   type         TransactionType
//   amount       Decimal         @db.Decimal(12, 2)
//   balanceAfter Decimal         @db.Decimal(12, 2)
//   createdAt    DateTime        @default(now())

//   wallet  Wallet   @relation(fields: [walletId], references: [id], onDelete: Restrict)
//   project Project? @relation(fields: [projectId], references: [id], onDelete: Restrict)

//   @@index([walletId, createdAt])
//   @@index([projectId])
//   @@map("wallet_transactions")
// }

// model Category {
//   id        String   @id @default(uuid()) @db.Uuid
//   name      String   @unique
//   createdAt DateTime @default(now())

//   projects Project[]

//   @@map("categories")
// }

// model Project {
//   id             String        @id @default(uuid()) @db.Uuid
//   clientId       String        @db.Uuid
//   categoryId     String        @db.Uuid
//   title          String
//   description    String        @db.Text
//   budget         Decimal       @db.Decimal(12, 2)
//   status         ProjectStatus @default(OPEN)
//   attachmentUrl  String?
//   attachmentName String?
//   attachmentMime String?
//   attachmentSize Int?
//   createdAt      DateTime      @default(now())
//   updatedAt      DateTime      @updatedAt

//   client       User                @relation("ProjectClient", fields: [clientId], references: [id], onDelete: Restrict)
//   category     Category            @relation(fields: [categoryId], references: [id], onDelete: Restrict)
//   proposals    Proposal[]
//   delivery     Delivery?
//   transactions WalletTransaction[]

//   @@index([status, categoryId, createdAt])
//   @@index([status, budget])
//   @@index([clientId, createdAt])
//   @@map("projects")
// }

// model Proposal {
//   id           String         @id @default(uuid()) @db.Uuid
//   projectId    String         @db.Uuid
//   freelancerId String         @db.Uuid
//   price        Decimal        @db.Decimal(12, 2)
//   durationDays Int
//   message      String         @db.Text
//   status       ProposalStatus @default(PENDING)
//   createdAt    DateTime       @default(now())

//   project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
//   freelancer User    @relation("ProposalFreelancer", fields: [freelancerId], references: [id], onDelete: Restrict)

//   @@unique([projectId, freelancerId])
//   @@index([projectId, status])
//   @@index([freelancerId, createdAt])
//   @@map("proposals")
// }

// model Delivery {
//   id         String    @id @default(uuid()) @db.Uuid
//   projectId  String    @unique @db.Uuid
//   filePath   String
//   fileName   String
//   sizeBytes  Int
//   uploadedAt DateTime  @default(now())
//   approvedAt DateTime?

//   project Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

//   @@map("deliveries")
// }
// EOF
// npm install --no-audit --no-fund 2>&1 | tail -5
