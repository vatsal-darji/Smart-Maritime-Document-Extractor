import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '@/utils/redisConfig';
import { ExtractionJobPayload } from '@/types/extraction';
import { runExtractionPipeline } from '@/services/extractionService';
import { serializeLLMError } from '@/services/llmService';
import {
  markJobComplete,
  markJobFailed,
  markJobProcessing,
} from '@/db/jobs';
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

extractionQueue.on('error', (err) => {
  console.error('[Queue:extraction] Redis/queue error', {
    message: err.message,
    stack: err.stack,
  });
});

async function processExtractionJob(job: Job<ExtractionJobPayload>) {
  const { jobId, sessionId, filePath, fileName, mimeType, fileHash } = job.data;
  const timerLabel = `[Queue:extraction] runExtractionPipeline bullJobId=${job.id} attempt=${job.attemptsMade + 1}`;
  let succeeded = false;
  
  if (!fs.existsSync(filePath)) {
      console.error('[Queue:extraction] File not found at path', { filePath, jobId });
      await markJobFailed(jobId, 'FILE_NOT_FOUND', `File missing: ${filePath}`, false);
      return;
  }

  console.log('[Queue:extraction] Processor picked up job', {
    bullJobId: job.id,
    dbJobId: jobId,
    sessionId,
    fileName,
    mimeType,
    attemptsMade: job.attemptsMade,
  });

  try {
    console.log('[Queue:extraction] Marking DB job PROCESSING', {
      bullJobId: job.id,
      dbJobId: jobId,
    });
    await markJobProcessing(jobId);

    //persist extraction result
    console.time(timerLabel);
    const extraction = await runExtractionPipeline({
      sessionId,
      filePath,
      fileName,
      mimeType,
      fileHash,
      cleanupFile: false,
      persistFailure: true,
    });
    console.timeEnd(timerLabel);
    succeeded = true;

    //mark COMPLETE in DB
    console.log('[Queue:extraction] Marking DB job COMPLETE', {
      bullJobId: job.id,
      dbJobId: jobId,
      extractionId: extraction.id,
    });
    await markJobComplete(jobId, extraction.id);

    return { extractionId: extraction.id };

  } catch (err: any) {
    console.timeEnd(timerLabel);
    const llmError = serializeLLMError(err);
    console.error('[Queue:extraction] Processor failed job', {
      bullJobId: job.id,
      dbJobId: jobId,
      attemptsMade: job.attemptsMade,
      source: llmError.source,
      code: llmError.code,
      status: llmError.status,
      httpStatus: llmError.httpStatus,
      retryable: llmError.retryable,
      message: llmError.message,
      stack: err?.stack,
    });
    throw err;

  } finally {
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
    const shouldCleanup = succeeded || isFinalAttempt;

    if (!shouldCleanup) {
      console.log('[Queue:extraction] Keeping temp file for retry', {
        bullJobId: job.id,
        dbJobId: jobId,
        filePath,
        nextAttempt: job.attemptsMade + 2,
        maxAttempts,
      });
    }

    fs.unlink(filePath, (err) => {
      if (err) {
        console.warn('[Queue:extraction] Temp file cleanup failed', {
          bullJobId: job.id,
          dbJobId: jobId,
          filePath,
          message: err.message,
        });
      } else {
        console.log('[Queue:extraction] Temp file cleaned up', {
          bullJobId: job.id,
          dbJobId: jobId,
          filePath,
        });
      }
    });
  }
}

export const setupWorkers = () => {
  console.log('[Queue:extraction] Initializing worker', {
    queueName: QUEUES.EXTRACTION,
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    redisPort: process.env.REDIS_PORT || '6379',
    concurrency: 5,
  });

  const extractionWorker = new Worker<ExtractionJobPayload>(
    QUEUES.EXTRACTION,
    processExtractionJob,
    {
      connection: redisConnection,
      concurrency: 5,  // process up to 5 jobs in parallel
    },
  );

  extractionWorker.on('ready', () => {
    console.log('[Queue:extraction] Worker ready and listening for jobs');
  });

  extractionWorker.on('active', (job) => {
    console.log('[Queue:extraction] Job active', {
      bullJobId: job.id,
      dbJobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
    });
  });

  extractionWorker.on('error', (err) => {
    console.error('[Queue:extraction] Worker error', {
      message: err.message,
      stack: err.stack,
    });
  });

  // Fires when job succeeds
  extractionWorker.on('completed', (job) => {
    console.log('[Queue:extraction] Job completed', {
      bullJobId: job.id,
      dbJobId: job.data.jobId,
      extractionId: job.returnvalue?.extractionId,
    });
  });

  // Fires on EVERY failed attempt, including retries
  extractionWorker.on('failed', async (job, err) => {
    if (!job) {
      console.error('[Queue:extraction] Job failed before BullMQ job was available', {
        message: err.message,
        stack: err.stack,
      });
      return;
    }

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    console.error('[Queue:extraction] Job failed attempt', {
      bullJobId: job.id,
      dbJobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      isLastAttempt,
      message: err.message,
    });

    const llmError = serializeLLMError(err);

    if (isLastAttempt) {
      await markJobFailed(
        job.data.jobId,
        llmError.code,
        JSON.stringify(llmError),
        llmError.retryable,
      );
    } else {
      console.log('[Queue:extraction] Job will retry', {
        bullJobId: job.id,
        dbJobId: job.data.jobId,
      });
    }
  });

  // Fires when a job has been running too long without progress
  extractionWorker.on('stalled', (jobId) => {
    console.warn('[Queue:extraction] Job stalled and will be re-queued automatically', {
      bullJobId: jobId,
    });
  });

  console.log('[Queue:extraction] BullMQ extraction worker initialized');

  return extractionWorker;
};
