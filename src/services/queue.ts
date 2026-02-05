import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/index.js';

// Job types
export interface RunJobData {
  runId: string;
  orgId: string;
}

// Create connection for queue (separate from worker connection)
const queueConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

// Create queue instance
export const orchestrationQueue = new Queue<RunJobData>('orchestration', {
  connection: queueConnection,
});

export async function enqueueRun(runId: string, orgId: string): Promise<string> {
  const job = await orchestrationQueue.add('run', { runId, orgId }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  });
  return job.id ?? '';
}
