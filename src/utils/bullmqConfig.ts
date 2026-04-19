import { Queue, Worker, Job, DefaultJobOptions } from 'bullmq';
import { redisConnection } from './redisConfig';
import dotenv from 'dotenv';

dotenv.config();

const queuePrefix = process.env.QUEUE_PREFIX || 'maritime';

const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};

// Define Queue names
export const QUEUES = {
  EXTRACTION: `extraction`,
  VALIDATION: `validation`,
};

// Initialize Queues
export const extractionQueue = new Queue(QUEUES.EXTRACTION, {
  connection: redisConnection,
  defaultJobOptions,
});

export const validationQueue = new Queue(QUEUES.VALIDATION, {
  connection: redisConnection,
  defaultJobOptions,
});

// Example Worker setup (can be moved to a separate file later)
export const setupWorkers = () => {
  const extractionWorker = new Worker(
    QUEUES.EXTRACTION,
    async (job: Job) => {
      console.log(`Processing extraction job ${job.id}...`);
      
      return { success: true };
    },
    { connection: redisConnection }
  );

  extractionWorker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
  });

  extractionWorker.on('failed', (job, err) => {
    console.log(`Job ${job?.id} has failed with ${err.message}`);
  });

  console.log('BullMQ Workers initialized');
};
