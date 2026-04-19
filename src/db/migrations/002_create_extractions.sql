CREATE TYPE extraction_status  AS ENUM ('COMPLETE', 'FAILED', 'PROCESSING');
CREATE TYPE confidence_level   AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE applicable_role    AS ENUM ('DECK', 'ENGINE', 'BOTH', 'N/A');

CREATE TABLE IF NOT EXISTS extractions (
  id                  UUID PRIMARY KEY,
  session_id          UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_hash           CHAR(64) NOT NULL,
  document_type       TEXT,
  document_name       TEXT,
  applicable_role     applicable_role,
  category            TEXT,
  confidence          confidence_level,
  holder_name         TEXT,
  date_of_birth       TEXT,
  nationality         TEXT,
  sirb_number         TEXT,
  passport_number     TEXT,
  rank                TEXT,
  issuing_authority   TEXT,
  regulation_reference TEXT,
  is_expired          BOOLEAN NOT NULL DEFAULT FALSE,
  is_required         BOOLEAN,
  date_of_issue       TEXT,
  date_of_expiry      TEXT,
  days_until_expiry   INTEGER,
  fitness_result      TEXT,
  drug_test_result    TEXT,
  fields_json         JSONB,
  flags_json          JSONB,
  validity_json       JSONB,
  medical_data_json   JSONB,
  compliance_json     JSONB,
  summary             TEXT,
  raw_llm_response    TEXT,
  processing_time_ms  INTEGER,
  status              extraction_status NOT NULL DEFAULT 'COMPLETE',
  prompt_version      TEXT DEFAULT 'v1',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at          TIMESTAMP
);

CREATE INDEX idx_extractions_session_id   ON extractions(session_id);
CREATE INDEX idx_extractions_dedup        ON extractions(session_id, file_hash)
  WHERE deleted_at IS NULL;                -- partial index: dedup only on active rows
CREATE INDEX idx_extractions_status       ON extractions(status);
CREATE INDEX idx_extractions_document_type ON extractions(document_type);
CREATE INDEX idx_extractions_is_expired   ON extractions(is_expired);
CREATE INDEX idx_extractions_date_expiry  ON extractions(date_of_expiry);