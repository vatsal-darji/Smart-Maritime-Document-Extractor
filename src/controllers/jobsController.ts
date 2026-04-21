import { Request, Response } from "express";
import { findJobById } from "@/repositories/job";
import { findExtractionById } from "@/repositories/extraction";
import { buildExtractionResponse } from "@/services/extractionService";

export async function getJobController(req: Request, res: Response) {
  const { jobId } = req.params as {jobId: string};

  const job = await findJobById(jobId);
  if (!job) {
    return res.status(404).json({
      error: "JOB_NOT_FOUND",
      message: `Job ${jobId} does not exist.`,
      retryAfterMs: null,
    });
  }

  if (job.status === "QUEUED" || job.status === "PROCESSING") {
    return res.status(200).json({
      jobId: job.id,
      status: job.status,
      queuePosition: null, // would need Redis inspection for accurate position
      startedAt: job.started_at,
      estimatedCompleteMs: 6000,
    });
  }

  // FAILED
  if (job.status === "FAILED") {
    return res.status(200).json({
      jobId: job.id,
      status: "FAILED",
      error: job.error_code,
      message: job.error_message,
      failedAt: job.failed_at,
      retryable: job.retryable,
    });
  }

  // COMPLETE — fetch and return the full extraction result
  if (job.status === "COMPLETE" && job.extraction_id) {
    const extraction = await findExtractionById(job.extraction_id);
    if (!extraction) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Job is complete but extraction record not found.",
        retryAfterMs: null,
      });
    }

    return res.status(200).json({
      jobId: job.id,
      status: "COMPLETE",
      extractionId: extraction.id,
      result: buildExtractionResponse(extraction),
      completedAt: job.completed_at,
    });
  }
}
