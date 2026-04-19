CREATE TYPE overall_status AS ENUM ('APPROVED', 'CONDITIONAL', 'REJECTED');

CREATE TABLE IF NOT EXISTS validations (
  id            UUID PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  overall_status  overall_status,
  overall_score   INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  detected_role   TEXT,
  summary         TEXT,
  validated_at    TIMESTAMP,
  consistency_checks_json   JSONB,
  missing_documents_json    JSONB,
  expiring_documents_json   JSONB,
  medical_flags_json        JSONB,
  recommendations_json      JSONB,
  holder_profile_json       JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);

CREATE INDEX idx_validations_session_id    ON validations(session_id);
CREATE INDEX idx_validations_overall_status ON validations(overall_status);