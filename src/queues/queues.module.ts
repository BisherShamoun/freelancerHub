import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsProcessor } from './notifications.processor.js';
import { QueuesService } from './queues.service.js';
import { NOTIFICATIONS_QUEUE } from './queues.constants.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }),
  ],
  providers: [QueuesService, NotificationsProcessor],
  exports: [QueuesService],
})
export class QueuesModule {}
