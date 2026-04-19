import { queryOne } from '@/db/index';
import { JobRow, JobStatus, CreateJobInput } from '@/types/db';

export async function createJob(input: CreateJobInput): Promise<JobRow> {
  const row = await queryOne<JobRow>(
    `INSERT INTO jobs (id, session_id, status, queued_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.id, input.session_id, input.status, input.queued_at],
  );
  return row!;
}

export async function findJobById(id: string): Promise<JobRow | null> {
  return queryOne<JobRow>(
    `SELECT * FROM jobs WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function updateJobProcessing(id: string): Promise<void> {
  await queryOne(
    `UPDATE jobs
     SET status = 'PROCESSING', started_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function updateJobComplete(
  id: string,
  extractionId: string,
): Promise<void> {
  await queryOne(
    `UPDATE jobs
     SET status      = 'COMPLETE',
         extraction_id = $1,
         completed_at  = NOW(),
         updated_at    = NOW()
     WHERE id = $2`,
    [extractionId, id],
  );
}

export async function updateJobFailed(
  id: string,
  errorCode: string,
  errorMessage: string,
  retryable: boolean,
): Promise<void> {
  await queryOne(
    `UPDATE jobs
     SET status        = 'FAILED',
         error_code    = $1,
         error_message = $2,
         retryable     = $3,
         failed_at     = NOW(),
         updated_at    = NOW(),
         attempt_count = attempt_count + 1
     WHERE id = $4`,
    [errorCode, errorMessage, retryable, id],
  );
}

export async function findPendingJobsBySession(
  sessionId: string,
): Promise<JobRow[]> {
  return (await queryOne<{ rows: JobRow[] }>(
    `SELECT * FROM jobs
     WHERE session_id = $1
       AND status IN ('QUEUED', 'PROCESSING')
       AND deleted_at IS NULL`,
    [sessionId],
  ) as any) ?? [];
}