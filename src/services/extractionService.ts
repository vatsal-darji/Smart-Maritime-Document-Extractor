import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { extractDocument } from '@/services/llmService';
import {
  LLMExtractionResult,
  SupportedExtractionMimeType,
} from '@/types/extraction';
import { ExtractionRow, CreateExtractionInput } from '@/types/db';
import {
  createExtraction,
  findExtractionByDedup,
} from '@/repositories/extraction';
import { findOrCreateSession } from '@/repositories/session';

export function computeFileHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildExtractionInput(
  sessionId: string,
  fileName: string,
  fileHash: string,
  parsed: LLMExtractionResult,
  raw: string,
  processingTimeMs: number,
): CreateExtractionInput {
  return {
    id: uuidv4(),
    session_id: sessionId,
    file_name: fileName,
    file_hash: fileHash,
    document_type: parsed.detection.documentType ?? null,
    document_name: parsed.detection.documentName ?? null,
    applicable_role: parsed.detection.applicableRole ?? null,
    category: parsed.detection.category ?? null,
    confidence: parsed.detection.confidence ?? null,
    holder_name: parsed.holder.fullName ?? null,
    date_of_birth: parsed.holder.dateOfBirth ?? null,
    nationality: parsed.holder.nationality ?? null,
    sirb_number: parsed.holder.sirbNumber ?? null,
    passport_number: parsed.holder.passportNumber ?? null,
    rank: parsed.holder.rank ?? null,
    issuing_authority: parsed.compliance.issuingAuthority ?? null,
    regulation_reference: parsed.compliance.regulationReference ?? null,
    is_expired: parsed.validity.isExpired ?? false,
    is_required: parsed.detection.isRequired ?? null,
    date_of_issue: parsed.validity.dateOfIssue ?? null,
    date_of_expiry: parsed.validity.dateOfExpiry ?? null,
    days_until_expiry: parsed.validity.daysUntilExpiry ?? null,
    fitness_result: parsed.medicalData.fitnessResult ?? null,
    drug_test_result: parsed.medicalData.drugTestResult ?? null,
    fields_json: parsed.fields ?? null,
    flags_json: parsed.flags ?? null,
    validity_json: parsed.validity ?? null,
    medical_data_json: parsed.medicalData ?? null,
    compliance_json: parsed.compliance ?? null,

    summary: parsed.summary ?? null,
    raw_llm_response: raw,
    processing_time_ms: processingTimeMs,
    status: "COMPLETE",
    prompt_version: "v1",
  };
}

export function buildExtractionResponse(row: ExtractionRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    fileName: row.file_name,
    documentType: row.document_type,
    documentName: row.document_name,
    applicableRole: row.applicable_role,
    category: row.category,
    confidence: row.confidence,
    holderName: row.holder_name,
    dateOfBirth: row.date_of_birth,
    sirbNumber: row.sirb_number,
    passportNumber: row.passport_number,
    fields: row.fields_json,
    validity: row.validity_json,
    compliance: row.compliance_json,
    medicalData: row.medical_data_json,
    flags: row.flags_json,
    isExpired: row.is_expired,
    processingTimeMs: row.processing_time_ms,
    summary: row.summary,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}

export async function runExtractionPipeline(opts: {
  sessionId: string;
  filePath: string;
  fileName: string;
  mimeType: SupportedExtractionMimeType;
  fileHash: string;
}): Promise<ExtractionRow> {
  const { sessionId, filePath, fileName, mimeType, fileHash } = opts;
  const startTime = Date.now();

  try {
    const { parsed, raw } = await extractDocument(filePath, mimeType, fileName);

    const input = buildExtractionInput(
      sessionId, fileName, fileHash, parsed, raw,
      Date.now() - startTime,
    );

    const row = await createExtraction(input);
    return row;

  } catch (err: any) {
    await createExtraction({
      id: uuidv4(),
      session_id: sessionId,
      file_name: fileName,
      file_hash: fileHash,
      is_expired: false,
      raw_llm_response: err.rawText ?? err.message ?? "Unknown error",
      processing_time_ms: Date.now() - startTime,
      status: "FAILED",
      prompt_version: "v1",
    });

    throw err;

  } finally {
    fs.unlink(filePath, () => {});
  }
}

export async function checkDedup(
  sessionId: string,
  fileHash: string,
): Promise<ExtractionRow | null> {
  return findExtractionByDedup(sessionId, fileHash);
}

export { findOrCreateSession };
