import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { FreelancerProfileModule } from './freelancer-profile/freelancer-profile.module.js';
import { CategoryModule } from './category/category.module.js';
import { ProjectModule } from './project/project.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { ProposalModule } from './proposal/proposal.module.js';
import { QueuesModule } from './queues/queues.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true, ttl: 10_000 }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            ...(redisUrl.username && { username: decodeURIComponent(redisUrl.username) }),
            ...(redisUrl.password && { password: decodeURIComponent(redisUrl.password) }),
            ...(redisUrl.protocol === 'rediss:' && { tls: {} }),
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    QueuesModule,
    UserModule,
    WalletModule,
    FreelancerProfileModule,
    CategoryModule,
    ProjectModule,
    ProposalModule,
    DeliveryModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
