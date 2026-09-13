import { Queue } from 'bullmq';
import logger from './logger';

import IORedis from 'ioredis';
import config from '../config';

export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const webhookDeliveryQueue = new Queue('webhook-delivery', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

webhookDeliveryQueue.on('error', (error) => {
  logger.error('Queue error', { error: error.message });
});

logger.info('✅ BullMQ webhook delivery queue initialized');