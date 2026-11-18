import { Module } from '@nestjs/common';

import { OutboxWorker } from './outbox.worker.js';

/** Push notifications: sends what the database queues in notification_outbox. */
@Module({ providers: [OutboxWorker] })
export class NotificationsModule {}
