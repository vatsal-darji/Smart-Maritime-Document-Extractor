export interface SessionRow {
  id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type ExtractionStatus = 'COMPLETE' | 'FAILED' | 'PROCESSING';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type ApplicableRole = 'DECK' | 'ENGINE' | 'BOTH' | 'N/A';

export interface ExtractionRow {
  id: string;
  session_id: string;
  file_name: string;
  file_hash: string;
  document_type: string | null;
  document_name: string | null;
  applicable_role: ApplicableRole | null;
  category: string | null;
  confidence: Confidence | null;
  holder_name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  sirb_number: string | null;
  passport_number: string | null;
  rank: string | null;
  issuing_authority: string | null;
  regulation_reference: string | null;
  is_expired: boolean;
  is_required: boolean | null;
  date_of_issue: string | null;
  date_of_expiry: string | null;
  days_until_expiry: number | null;
  fitness_result: string | null;
  drug_test_result: string | null;
  fields_json: object[] | null;
  flags_json: object[] | null;
  validity_json: object | null;
  medical_data_json: object | null;
  compliance_json: object | null;
  summary: string | null;
  raw_llm_response: string | null;
  processing_time_ms: number | null;
  status: ExtractionStatus;
  prompt_version: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateExtractionInput {
  id: string;
  session_id: string;
  file_name: string;
  file_hash: string;
  is_expired: boolean;
  raw_llm_response: string | null;
  processing_time_ms: number | null;
  status: ExtractionStatus;
  prompt_version?: string | null;
  document_type?: string | null;
  document_name?: string | null;
  applicable_role?: ApplicableRole | null;
  category?: string | null;
  confidence?: Confidence | null;
  holder_name?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  sirb_number?: string | null;
  passport_number?: string | null;
  rank?: string | null;
  issuing_authority?: string | null;
  regulation_reference?: string | null;
  is_required?: boolean | null;
  date_of_issue?: string | null;
  date_of_expiry?: string | null;
  days_until_expiry?: number | null;
  fitness_result?: string | null;
  drug_test_result?: string | null;
  fields_json?: object[] | null;
  flags_json?: object[] | null;
  validity_json?: object | null;
  medical_data_json?: object | null;
  compliance_json?: object | null;
  summary?: string | null;
}

export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

export interface JobRow {
  id: string;
  session_id: string;
  extraction_id: string | null;
  status: JobStatus;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  attempt_count: number;
  queued_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type CreateJobInput = Pick<
  JobRow,
  'id' | 'session_id' | 'status' | 'queued_at'
>;

export type OverallStatus = 'APPROVED' | 'CONDITIONAL' | 'REJECTED';

export interface ValidationRow {
  id: string;
  session_id: string;
  overall_status: OverallStatus | null;
  overall_score: number | null;
  detected_role: string | null;
  summary: string | null;
  validated_at: Date | null;
  consistency_checks_json: object[] | null;
  missing_documents_json: object[] | null;
  expiring_documents_json: object[] | null;
  medical_flags_json: object[] | null;
  recommendations_json: string[] | null;
  holder_profile_json: object | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
