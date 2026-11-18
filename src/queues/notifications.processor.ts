import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queues.constants.js';

interface NotificationJob {
  userId: string;
  message: string;
}

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job<NotificationJob>): Promise<void> {
    if (job.name !== 'notification') {
      this.logger.warn(`Unknown job type: ${job.name}`);
      return;
    }

    //  Integrate an email
    this.logger.log(
      `Processing notification for user ${job.data.userId}: ${job.data.message}`,
    );
  }
}
