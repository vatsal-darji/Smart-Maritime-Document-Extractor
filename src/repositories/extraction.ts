import { queryOne, queryRows } from '@/db/index';
import { ExtractionRow, CreateExtractionInput } from '@/types/db';

export async function findExtractionByDedup(
  sessionId: string,
  fileHash: string,
): Promise<ExtractionRow | null> {
  return queryOne<ExtractionRow>(
    `SELECT * FROM extractions
     WHERE session_id = $1
       AND file_hash  = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [sessionId, fileHash],
  );
}

export async function createExtraction(
  input: CreateExtractionInput,
): Promise<ExtractionRow> {
  const row = await queryOne<ExtractionRow>(
    `INSERT INTO extractions (
      id, session_id, file_name, file_hash,
      document_type, document_name, applicable_role, category,
      confidence, holder_name, date_of_birth, nationality,
      sirb_number, passport_number, rank, issuing_authority,
      regulation_reference, is_expired, is_required,
      date_of_issue, date_of_expiry, days_until_expiry,
      fitness_result, drug_test_result,
      fields_json, flags_json, validity_json, medical_data_json, compliance_json,
      summary, raw_llm_response, processing_time_ms, status, prompt_version
    ) VALUES (
      $1,  $2,  $3,  $4,
      $5,  $6,  $7,  $8,
      $9,  $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19,
      $20, $21, $22,
      $23, $24,
      $25, $26, $27, $28, $29,
      $30, $31, $32, $33, $34
    ) RETURNING *`,
    [
      input.id,               input.session_id,      input.file_name,       input.file_hash,
      input.document_type ?? null,    input.document_name ?? null,   input.applicable_role ?? null, input.category ?? null,
      input.confidence ?? null,       input.holder_name ?? null,     input.date_of_birth ?? null,   input.nationality ?? null,
      input.sirb_number ?? null,      input.passport_number ?? null, input.rank ?? null,            input.issuing_authority ?? null,
      input.regulation_reference ?? null, input.is_expired,  input.is_required ?? null,
      input.date_of_issue ?? null,    input.date_of_expiry ?? null,  input.days_until_expiry ?? null,
      input.fitness_result ?? null,   input.drug_test_result ?? null,
      JSON.stringify(input.fields_json   ?? null),
      JSON.stringify(input.flags_json    ?? null),
      JSON.stringify(input.validity_json ?? null),
      JSON.stringify(input.medical_data_json  ?? null),
      JSON.stringify(input.compliance_json    ?? null),
      input.summary ?? null,  input.raw_llm_response, input.processing_time_ms,
      input.status,           input.prompt_version ?? 'v1',
    ],
  );

  return row!;
}

export async function updateExtractionStatus(
  id: string,
  status: 'COMPLETE' | 'FAILED',
  rawLlmResponse?: string,
): Promise<void> {
  await queryOne(
    `UPDATE extractions
     SET status = $1, raw_llm_response = COALESCE($2, raw_llm_response), updated_at = NOW()
     WHERE id = $3`,
    [status, rawLlmResponse ?? null, id],
  );
}

export async function findExtractionsBySession(
  sessionId: string,
): Promise<ExtractionRow[]> {
  return queryRows<ExtractionRow>(
    `SELECT * FROM extractions
     WHERE session_id = $1
       AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [sessionId],
  );
}

export async function findExtractionById(
  id: string,
): Promise<ExtractionRow | null> {
  return queryOne<ExtractionRow>(
    `SELECT * FROM extractions
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}
