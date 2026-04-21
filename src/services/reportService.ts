import { ExtractionRow, ValidationRow } from "@/types/db";
import { FlagSeverity } from "@/types/extraction";

function deriveOverallHealth(
  extractions: ExtractionRow[],
): "OK" | "WARN" | "CRITICAL" {
  const allFlags = extractions.flatMap((e) => (e.flags_json as any[]) ?? []);

  const hasCritical =
    allFlags.some((f: any) => f.severity === "CRITICAL") ||
    extractions.some((e) => e.is_expired);

  if (hasCritical) return "CRITICAL";

  const hasWarn =
    allFlags.some((f: any) => ["HIGH", "MEDIUM"].includes(f.severity)) ||
    extractions.some(
      (e) => e.days_until_expiry !== null && e.days_until_expiry <= 90,
    );

  if (hasWarn) return "WARN";

  return "OK";
}

export function buildReport(
  sessionId: string,
  extractions: ExtractionRow[],
  validation: ValidationRow | null,
) {
  const overallHealth = deriveOverallHealth(extractions);

  // Per-document summary rows
  const documents = extractions.map((e) => {
    const flags = (e.flags_json as any[]) ?? [];
    return {
      id: e.id,
      fileName: e.file_name,
      documentType: e.document_type,
      documentName: e.document_name,
      applicableRole: e.applicable_role,
      confidence: e.confidence,
      holderName: e.holder_name,
      isExpired: e.is_expired,
      dateOfExpiry: e.date_of_expiry,
      daysUntilExpiry: e.days_until_expiry,
      fitnessResult: e.fitness_result,
      drugTestResult: e.drug_test_result,
      issuingAuthority: e.issuing_authority,
      flagCount: flags.length,
      criticalFlagCount: flags.filter((f: any) => f.severity === "CRITICAL")
        .length,
      flags: flags,
      status: e.status,
      createdAt: e.created_at,
    };
  });

  // Expiring within 90 days — sorted by urgency
  const expiringDocuments = extractions
    .filter(
      (e) =>
        e.days_until_expiry !== null &&
        e.days_until_expiry <= 90 &&
        !e.is_expired,
    )
    .sort((a, b) => (a.days_until_expiry ?? 0) - (b.days_until_expiry ?? 0))
    .map((e) => ({
      id: e.id,
      documentType: e.document_type,
      documentName: e.document_name,
      dateOfExpiry: e.date_of_expiry,
      daysUntilExpiry: e.days_until_expiry,
    }));

  // Expired documents
  const expiredDocuments = documents.filter((d) => d.isExpired);

  // All critical flags across session
  const criticalFlags = extractions.flatMap((e) =>
    ((e.flags_json as any[]) ?? [])
      .filter((f: any) => f.severity === "CRITICAL")
      .map((f: any) => ({
        ...f,
        documentType: e.document_type,
        fileName: e.file_name,
      })),
  );

  return {
    sessionId,
    generatedAt: new Date(),
    overallHealth,
    // Hire / no-hire decision block
    decision: {
      overallStatus: validation?.overall_status ?? null,
      overallScore: validation?.overall_score ?? null,
      summary: validation?.summary ?? null,
      recommendations: validation?.recommendations_json ?? [],
      validatedAt: validation?.validated_at ?? null,
    },
    holderProfile: validation?.holder_profile_json ?? null,
    documentCount: extractions.length,
    documents,
    expiredDocuments,
    expiringDocuments,
    criticalFlags,
    missingDocuments: validation?.missing_documents_json ?? [],
    consistencyChecks: validation?.consistency_checks_json ?? [],
    medicalFlags: validation?.medical_flags_json ?? [],
  };
}
