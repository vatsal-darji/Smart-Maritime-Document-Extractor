CREATE TYPE job_status AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED');

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  extraction_id UUID REFERENCES extractions(id) ON DELETE SET NULL,
  status        job_status NOT NULL DEFAULT 'QUEUED',
  error_code    TEXT,
  error_message TEXT,
  retryable     BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  queued_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  failed_at     TIMESTAMP,

  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP
);

CREATE INDEX idx_jobs_session_id    ON jobs(session_id);
CREATE INDEX idx_jobs_status        ON jobs(status);
CREATE INDEX idx_jobs_extraction_id ON jobs(extraction_id);