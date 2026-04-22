import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '@/utils/redisConfig';
import { ExtractionJobPayload } from '@/types/extraction';
import { runExtractionPipeline } from '@/services/extractionService';
import { markJobComplete, markJobFailed, markJobProcessing } from '@/db/jobs';
import * as fs from 'node:fs';

export const QUEUES = {
  EXTRACTION: 'extraction',
} as const;

export const extractionQueue = new Queue<ExtractionJobPayload>(QUEUES.EXTRACTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

async function processExtractionJob(job: Job<ExtractionJobPayload>) {
  const { jobId, sessionId, filePath, fileName, mimeType, fileHash } = job.data;

  //mark PROCESSING in DB
  await markJobProcessing(jobId);

  try {
    //persist extraction result
    const extraction = await runExtractionPipeline({
      sessionId,
      filePath,
      fileName,
      mimeType,
      fileHash,
    });

    //mark COMPLETE in DB
    await markJobComplete(jobId, extraction.id);

    return { extractionId: extraction.id };

  } catch (err: any) {
    throw err;

  } finally {
    // Always clean up temp file — whether success or failure
    fs.unlink(filePath, () => {});
  }
}

export const setupWorkers = () => {
  const extractionWorker = new Worker<ExtractionJobPayload>(
    QUEUES.EXTRACTION,
    processExtractionJob,
    {
      connection: redisConnection,
      concurrency: 5,  // process up to 5 jobs in parallel
    },
  );

  // Fires when job succeeds
  extractionWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed — extraction ${job.returnvalue?.extractionId}`);
  });

  // Fires on EVERY failed attempt, including retries
  extractionWorker.on('failed', async (job, err) => {
    if (!job) return;

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    // Only write FAILED to DB on the last attempt — earlier attempts will retry
    if (isLastAttempt) {
      const errorCode = err.message === 'LLM_TIMEOUT'
        ? 'LLM_TIMEOUT'
        : 'LLM_JSON_PARSE_FAIL';

      await markJobFailed(job.data.jobId, errorCode, err.message, false);
    } else {
      console.log(`[Worker] Job ${job.id} attempt ${job.attemptsMade} failed, retrying...`);
    }
  });

  // Fires when a job has been running too long without progress
  extractionWorker.on('stalled', (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled — will be re-queued automatically`);
  });

  console.log('[Worker] BullMQ extraction worker initialized');

  return extractionWorker;
};
