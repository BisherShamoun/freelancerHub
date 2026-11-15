import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queues.constants.js';

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly notificationsQueue: Queue,
  ) {}

  async enqueueNotification(userId: string, message: string) {
    return this.notificationsQueue.add(
      'notification',
      { userId, message },
      { jobId: `notification-${userId}-${Date.now()}` },
    );
  }
}
