import fs from 'fs';
import { Queue, Worker, Job, DefaultJobOptions } from 'bullmq';
import { redisConnection } from './redisConfig';
import { runExtractionPipeline } from '@/services/extractionService';
import { updateJobProcessing, updateJobComplete, updateJobFailed } from '@/repositories/job';
import { SupportedExtractionMimeType } from '@/types/extraction';
import { classifyLlmError } from '@/helpers/common';
import dotenv from 'dotenv';

dotenv.config();

const queuePrefix = process.env.QUEUE_PREFIX || 'maritime';

const defaultJobOptions: DefaultJobOptions = {
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 10_000, // 10s → 20s → 40s between retries
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

export const setupWorkers = () => {
  const extractionWorker = new Worker(
    QUEUES.EXTRACTION,
    async (job: Job) => {
      const { jobId, sessionId, filePath, fileName, mimeType, fileHash } = job.data;

      await updateJobProcessing(jobId);

      try {
        const extraction = await runExtractionPipeline({
          sessionId,
          filePath,
          fileName,
          mimeType: mimeType as SupportedExtractionMimeType,
          fileHash,
        });

        await updateJobComplete(jobId, extraction.id);
        fs.unlink(filePath, () => {});
      } catch (err: any) {
        const maxAttempts = job.opts.attempts ?? 4;
        const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

        if (isLastAttempt) {
          await updateJobFailed(jobId, classifyLlmError(err), err.message ?? 'Extraction failed', false);
          fs.unlink(filePath, () => {});
        }

        throw err;
      }
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
