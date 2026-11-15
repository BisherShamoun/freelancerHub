import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queues.module.js';

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

    // TODO: Integrate an email, push, or in-app notification provider here.
    this.logger.log(
      `Processing notification for user ${job.data.userId}: ${job.data.message}`,
    );
  }
}
