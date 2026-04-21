import { queryOne, queryRows } from '@/db';
import { ValidationRow } from '@/types/db';
import { v4 as uuidv4 } from 'uuid';

export interface CreateValidationInput {
  session_id:                 string;
  overall_status:             string;
  overall_score:              number;
  detected_role:              string | null;
  summary:                    string;
  validated_at:               Date;
  consistency_checks_json:    object[];
  missing_documents_json:     object[];
  expiring_documents_json:    object[];
  medical_flags_json:         object[];
  recommendations_json:       string[];
  holder_profile_json:        object;
}

export async function createValidation(
  input: CreateValidationInput,
): Promise<ValidationRow> {
  const row = await queryOne<ValidationRow>(
    `INSERT INTO validations (
      id, session_id,
      overall_status, overall_score, detected_role, summary, validated_at,
      consistency_checks_json, missing_documents_json, expiring_documents_json,
      medical_flags_json, recommendations_json, holder_profile_json
    ) VALUES (
      $1,  $2,
      $3,  $4,  $5,  $6,  $7,
      $8,  $9,  $10,
      $11, $12, $13
    ) RETURNING *`,
    [
      uuidv4(),             input.session_id,
      input.overall_status, input.overall_score, input.detected_role,
      input.summary,        input.validated_at,
      JSON.stringify(input.consistency_checks_json),
      JSON.stringify(input.missing_documents_json),
      JSON.stringify(input.expiring_documents_json),
      JSON.stringify(input.medical_flags_json),
      JSON.stringify(input.recommendations_json),
      JSON.stringify(input.holder_profile_json),
    ],
  );
  return row!;
}

export async function findLatestValidationBySession(
  sessionId: string,
): Promise<ValidationRow | null> {
  return queryOne<ValidationRow>(
    `SELECT * FROM validations
     WHERE session_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId],
  );
}