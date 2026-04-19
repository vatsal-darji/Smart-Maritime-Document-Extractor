import { query } from "./index";

export async function markJobProcessing(jobId: string) {
  await query(
    `UPDATE jobs
     SET status = $2, started_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [jobId, "PROCESSING"],
  );
}

export async function markJobComplete(jobId: string, extractionId: string) {
  await query(
    `UPDATE jobs
     SET status = $2,
         extraction_id = $3,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, "COMPLETE", extractionId],
  );
}

export async function markJobFailed(
  jobId: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean,
) {
  await query(
    `UPDATE jobs
     SET status = $2,
         error_code = $3,
         error_message = $4,
         failed_at = NOW(),
         retryable = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, "FAILED", errorCode, errorMessage, retryable],
  );
}
