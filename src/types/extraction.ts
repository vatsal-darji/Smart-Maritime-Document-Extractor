export type SupportedExtractionMimeType =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

export interface ExtractionJobPayload {
  jobId: string;
  sessionId: string;
  filePath: string;
  fileName: string;
  mimeType: SupportedExtractionMimeType;
  fileHash: string;
  webhookUrl?: string;
};

export type Confidence      = 'HIGH' | 'MEDIUM' | 'LOW';
export type ApplicableRole  = 'DECK' | 'ENGINE' | 'BOTH' | 'N/A';
export type DocumentCategory =
  | 'IDENTITY'
  | 'CERTIFICATION'
  | 'STCW_ENDORSEMENT'
  | 'MEDICAL'
  | 'TRAINING'
  | 'FLAG_STATE'
  | 'OTHER';

export type DocumentType =
  | 'COC'
  | 'COP_BT'
  | 'COP_PSCRB'
  | 'COP_AFF'
  | 'COP_MEFA'
  | 'COP_MECA'
  | 'COP_SSO'
  | 'COP_SDSD'
  | 'ECDIS_GENERIC'
  | 'ECDIS_TYPE'
  | 'SIRB'
  | 'PASSPORT'
  | 'PEME'
  | 'DRUG_TEST'
  | 'YELLOW_FEVER'
  | 'ERM'
  | 'MARPOL'
  | 'SULPHUR_CAP'
  | 'BALLAST_WATER'
  | 'HATCH_COVER'
  | 'BRM_SSBT'
  | 'TRAIN_TRAINER'
  | 'HAZMAT'
  | 'FLAG_STATE'
  | 'OTHER';

export interface LLMDetection {
  documentType:    DocumentType;
  documentName:    string;
  category:        DocumentCategory;
  applicableRole:  ApplicableRole;
  isRequired:      boolean;
  confidence:      Confidence;
  detectionReason: string;
}

export interface LLMHolder {
  fullName:       string | null;
  dateOfBirth:    string | null;
  nationality:    string | null;
  passportNumber: string | null;
  sirbNumber:     string | null;
  rank:           string | null;
  photo:          'PRESENT' | 'ABSENT';
}

export type FieldImportance = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FieldStatus     = 'OK' | 'EXPIRED' | 'WARNING' | 'MISSING' | 'N/A';

export interface LLMField {
  key:        string;
  label:      string;
  value:      string;
  importance: FieldImportance;
  status:     FieldStatus;
}

export interface LLMValidity {
  dateOfIssue:          string | null;
  dateOfExpiry:         string | 'No Expiry' | 'Lifetime' | null;
  isExpired:            boolean;
  daysUntilExpiry:      number | null;
  revalidationRequired: boolean | null;
}

export interface LLMCompliance {
  issuingAuthority:   string;
  regulationReference: string | null;
  imoModelCourse:     string | null;
  recognizedAuthority: boolean;
  limitations:        string | null;
}

export interface LLMMedicalData {
  fitnessResult:   'FIT' | 'UNFIT' | 'N/A';
  drugTestResult:  'NEGATIVE' | 'POSITIVE' | 'N/A';
  restrictions:    string | null;
  specialNotes:    string | null;
  expiryDate:      string | null;
}

export type FlagSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface LLMFlag {
  severity: FlagSeverity;
  message:  string;
}

export interface LLMExtractionResult {
  detection:   LLMDetection;
  holder:      LLMHolder;
  fields:      LLMField[];
  validity:    LLMValidity;
  compliance:  LLMCompliance;
  medicalData: LLMMedicalData;
  flags:       LLMFlag[];
  summary:     string;
}
