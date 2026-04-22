import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  computeFileHash,
  runExtractionPipeline,
  buildExtractionResponse,
  checkDedup,
  findOrCreateSession,
} from '@/services/extractionService';
import { createJob } from '@/repositories/job';
import { extractionQueue } from '@/helpers/queue';
import { SupportedExtractionMimeType } from '@/types/extraction'
import { serializeLLMError } from '@/services/llmService';
import fs from 'node:fs'

function isSupportedMimeType(value: string): value is SupportedExtractionMimeType {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "application/pdf"
  );
}

export async function extractController(req: Request, res: Response) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      error: 'UNSUPPORTED_FORMAT',
      message: 'No file uploaded.',
      retryAfterMs: null,
    });
  }

  const mode = (req.query.mode as string) ?? 'sync';
  const sessionId = req.body.sessionId as string | undefined;

  if (!isSupportedMimeType(file.mimetype)) {
    return res.status(400).json({
      error: 'UNSUPPORTED_FORMAT',
      message: 'Only JPEG, PNG, and PDF files are supported.',
      retryAfterMs: null,
    });
  }

  const mimeType: SupportedExtractionMimeType = file.mimetype;

  //verify session id
  // if (sessionId) {
  //   const session = await findOrCreateSession(sessionId);
  //   if (!session) {
  //     return res.status(404).json({
  //       error: 'SESSION_NOT_FOUND',
  //       message: `Session ${sessionId} does not exist.`,
  //       retryAfterMs: null,
  //     });
  //   }
  // }

  const resolvedSessionId = sessionId ?? uuidv4();
  await findOrCreateSession(resolvedSessionId);

  const fileHash = computeFileHash(file.path);

  const duplicate = await checkDedup(resolvedSessionId, fileHash);
  if (duplicate) {
    res.setHeader('X-Deduplicated', 'true');
    return res.status(200).json(buildExtractionResponse(duplicate));
  }

  if (mode === 'sync') {
    try {
      const extraction = await runExtractionPipeline({
        sessionId: resolvedSessionId,
        filePath: file.path,
        fileName: file.originalname,
        mimeType,
        fileHash,
      });

      return res.status(200).json(buildExtractionResponse(extraction));

    } catch (err: any) {
      const llmError = serializeLLMError(err);

      return res.status(422).json({
        error: llmError.code,
        source: llmError.source,
        message: llmError.message,
        providerStatus: llmError.status,
        providerHttpStatus: llmError.httpStatus,
        retryable: llmError.retryable,
        retryAfterMs: null,
      });
    }
  }

  if (mode === 'async') {
    const jobId = uuidv4();

    console.log('[Extract] Creating async extraction job', {
      dbJobId: jobId,
      sessionId: resolvedSessionId,
      fileName: file.originalname,
      mimeType,
      fileSize: file.size,
    });

    // Write DB record BEFORE enqueuing — polling endpoint must never 404
    await createJob({
      id:         jobId,
      session_id: resolvedSessionId,
      status:     'QUEUED',
      queued_at:  new Date(),
    });

    console.log('[Extract] DB job created, adding job to BullMQ', {
      dbJobId: jobId,
      queueName: 'extraction',
    });

    const bullJob = await extractionQueue.add('extract', {
      jobId,
      sessionId:  resolvedSessionId,
      filePath:   file.path,
      fileName:   file.originalname,
      mimeType,
      fileHash,
    });

    const counts = await extractionQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
      'paused',
    );

    console.log('[Extract] Async extraction job enqueued', {
      bullJobId: bullJob.id,
      dbJobId: jobId,
      queueCounts: counts,
    });

    return res.status(202).json({
      jobId,
      sessionId:       resolvedSessionId,
      status:          'QUEUED',
      pollUrl:         `/api/jobs/${jobId}`,
      estimatedWaitMs: 6000,
    });
  }

  return res.status(400).json({
    error: 'INTERNAL_ERROR',
    message: 'Invalid mode. Use ?mode=sync or ?mode=async',
    retryAfterMs: null,
  });
}
