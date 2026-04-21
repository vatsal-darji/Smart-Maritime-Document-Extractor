import { GoogleGenAI } from '@google/genai';
import { ExtractionRow } from '@/types/db';
import { extractJSON } from '@/services/llmService';
import { createValidation } from '@/repositories/validation';
import { ValidationRow } from '@/types/db';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY ?? (() => { throw new Error('GEMINI_API_KEY not set'); })(),
});

function buildValidationPrompt(extractions: ExtractionRow[]): string {
  const documentSummaries = extractions.map((e, i) => ({
    index:          i + 1,
    documentType:   e.document_type,
    documentName:   e.document_name,
    holderName:     e.holder_name,
    dateOfBirth:    e.date_of_birth,
    sirbNumber:     e.sirb_number,
    passportNumber: e.passport_number,
    applicableRole: e.applicable_role,
    confidence:     e.confidence,
    isExpired:      e.is_expired,
    dateOfExpiry:   e.date_of_expiry,
    daysUntilExpiry: e.days_until_expiry,
    fitnessResult:  e.fitness_result,
    drugTestResult: e.drug_test_result,
    issuingAuthority: e.issuing_authority,
    regulationReference: e.regulation_reference,
    flags:          e.flags_json,
  }));

  return `You are a maritime compliance expert with deep knowledge of STCW, MARINA, and IMO regulations.

You are given a set of seafarer documents extracted from a single Manning Agent session.
Your task is to perform a cross-document compliance assessment.

Documents (${extractions.length} total):
${JSON.stringify(documentSummaries, null, 2)}

Perform the following checks:

1. HOLDER CONSISTENCY — Do all documents belong to the same person?
   Check: full name, date of birth, SIRB number, passport number for consistency across documents.
   Flag any mismatch as a CRITICAL inconsistency.

2. ROLE DETERMINATION — Based on the documents present, determine if the holder is a DECK or ENGINE officer.
   If documents conflict (some say DECK, some say ENGINE), flag it.

3. MISSING DOCUMENTS — Based on the role determined and STCW requirements, identify which required
   documents are missing. Consider: COC, SIRB, PASSPORT, PEME, DRUG_TEST, basic safety certificates
   (COP_BT, COP_PSCRB, COP_AFF, COP_MEFA, COP_MECA).

4. EXPIRY CHECK — Identify documents expiring within 90 days or already expired.
   Expired required documents must be flagged as CRITICAL.

5. MEDICAL FLAGS — Summarise any fitness or drug test results. Flag UNFIT or POSITIVE results as CRITICAL.

6. OVERALL DECISION:
   - APPROVED: all required docs present, valid, holder consistent, no critical flags
   - CONDITIONAL: minor issues — some docs expiring soon, low confidence detections, non-critical flags
   - REJECTED: missing critical docs, expired required certs, holder inconsistency, UNFIT/POSITIVE medical

Return ONLY a valid JSON object. No markdown. No code fences. No explanation.

{
  "holderProfile": {
    "fullName": "string or null",
    "dateOfBirth": "string or null",
    "nationality": "string or null",
    "sirbNumber": "string or null",
    "passportNumber": "string or null",
    "rank": "string or null",
    "detectedRole": "DECK | ENGINE | BOTH | UNKNOWN"
  },
  "consistencyChecks": [
    {
      "field": "full_name | date_of_birth | sirb_number | passport_number",
      "status": "CONSISTENT | INCONSISTENT | INSUFFICIENT_DATA",
      "detail": "one sentence explanation"
    }
  ],
  "missingDocuments": [
    {
      "documentType": "COC | COP_BT | ...",
      "documentName": "human readable name",
      "severity": "CRITICAL | HIGH | MEDIUM",
      "reason": "why this document is required"
    }
  ],
  "expiringDocuments": [
    {
      "documentType": "string",
      "documentName": "string",
      "dateOfExpiry": "string",
      "daysUntilExpiry": 0,
      "severity": "CRITICAL | HIGH | MEDIUM"
    }
  ],
  "medicalFlags": [
    {
      "documentType": "PEME | DRUG_TEST | YELLOW_FEVER",
      "fitnessResult": "FIT | UNFIT | N/A",
      "drugTestResult": "NEGATIVE | POSITIVE | N/A",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "detail": "string"
    }
  ],
  "overallStatus": "APPROVED | CONDITIONAL | REJECTED",
  "overallScore": 0,
  "summary": "Two to three sentence plain English summary for a Manning Agent.",
  "recommendations": ["string", "string"]
}`;
}

async function callValidationLLM(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    contents: [{ text: prompt }],
  });
  return response.text ?? '';
}

export async function runValidation(
  sessionId: string,
  extractions: ExtractionRow[],
): Promise<ValidationRow> {
  const prompt = buildValidationPrompt(extractions);

  const raw = await callValidationLLM(prompt);
  const parsed = extractJSON(raw) as any;

  if (!parsed) {
    throw new Error('VALIDATION_PARSE_FAIL');
  }

  const row = await createValidation({
    session_id: sessionId,
    overall_status: parsed.overallStatus,
    overall_score: parsed.overallScore,
    detected_role: parsed.holderProfile?.detectedRole ?? null,
    summary: parsed.summary,
    validated_at: new Date(),
    consistency_checks_json: parsed.consistencyChecks ?? [],
    missing_documents_json: parsed.missingDocuments ?? [],
    expiring_documents_json: parsed.expiringDocuments ?? [],
    medical_flags_json: parsed.medicalFlags ?? [],
    recommendations_json: parsed.recommendations ?? [],
    holder_profile_json: parsed.holderProfile ?? {},
  });

  return row;
}