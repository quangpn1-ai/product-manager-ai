import { Worker } from 'bullmq';
import IORedis from 'ioredis';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/index.js';
import { orchestrationService } from './services/orchestration/orchestration-service.js';
import type { RunJobData } from './services/queue.js';

// Create Redis connection for worker
const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

// Create worker
const worker = new Worker<RunJobData>(
  'orchestration',
  async (job) => {
    const { runId, orgId } = job.data;
    logger.info({ jobId: job.id, runId, orgId }, 'Processing orchestration job');

    try {
      await orchestrationService.executeRun(runId, orgId);
      logger.info({ jobId: job.id, runId }, 'Job completed successfully');
    } catch (error) {
      logger.error({ jobId: job.id, runId, error }, 'Job failed');
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000, // 10 jobs per second max
    },
  }
);

// Event handlers
worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, 'Job failed');
});

worker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error');
});

logger.info('Worker started');

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');

  await worker.close();
  await connection.quit();
  await closePool();

  logger.info('Worker shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
