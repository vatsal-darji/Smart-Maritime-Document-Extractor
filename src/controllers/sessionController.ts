import { Request, Response } from "express";
import { findSessionById } from "@/repositories/session";
import { findExtractionsBySession } from "@/repositories/extraction";
import { findPendingJobsBySession } from "@/repositories/job";
import { findLatestValidationBySession } from "@/repositories/validation";
import { runValidation } from "@/services/validationService";
import { buildReport } from "@/services/reportService";


export async function getSessionController(req: Request, res: Response) {
  const { sessionId } = req.params as { sessionId: string };

  const session = await findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: `Session ${sessionId} does not exist.`,
      retryAfterMs: null,
    });
  }

  const extractions = await findExtractionsBySession(sessionId);
  const pendingJobs = await findPendingJobsBySession(sessionId);

  // Derive overall health from extractions
  const allFlags = extractions.flatMap((e) => (e.flags_json as any[]) ?? []);
  const hasCritical =
    allFlags.some((f: any) => f.severity === "CRITICAL") ||
    extractions.some((e) => e.is_expired);
  const hasWarn =
    allFlags.some((f: any) => ["HIGH", "MEDIUM"].includes(f.severity)) ||
    extractions.some(
      (e) => e.days_until_expiry !== null && e.days_until_expiry <= 90,
    );

  const overallHealth = hasCritical ? "CRITICAL" : hasWarn ? "WARN" : "OK";

  // Detect dominant role across documents
  const roles = extractions.map((e) => e.applicable_role).filter(Boolean);
  const detectedRole = roles.includes("DECK")
    ? "DECK"
    : roles.includes("ENGINE")
      ? "ENGINE"
      : null;

  return res.status(200).json({
    sessionId,
    documentCount: extractions.length,
    detectedRole,
    overallHealth,
    documents: extractions.map((e) => {
      const flags = (e.flags_json as any[]) ?? [];
      return {
        id: e.id,
        fileName: e.file_name,
        documentType: e.document_type,
        applicableRole: e.applicable_role,
        holderName: e.holder_name,
        confidence: e.confidence,
        isExpired: e.is_expired,
        flagCount: flags.length,
        criticalFlagCount: flags.filter((f: any) => f.severity === "CRITICAL")
          .length,
        createdAt: e.created_at,
      };
    }),
    pendingJobs: pendingJobs.map((j) => ({
      jobId: j.id,
      status: j.status,
    })),
  });
}

export async function validateSessionController(req: Request, res: Response) {
  const { sessionId } = req.params as { sessionId: string };

  const session = await findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: `Session ${sessionId} does not exist.`,
      retryAfterMs: null,
    });
  }

  const extractions = await findExtractionsBySession(sessionId);
  
  console.log("extractions => ", extractions)

  // Assessment requires minimum 2 documents
  if (extractions.length < 2) {
    return res.status(400).json({
      error: "INSUFFICIENT_DOCUMENTS",
      message: "Validation requires at least 2 documents in the session.",
      retryAfterMs: null,
    });
  }
  try {
    const validation = await runValidation(sessionId, extractions);

    return res.status(200).json({
      sessionId,
      holderProfile: validation.holder_profile_json,
      consistencyChecks: validation.consistency_checks_json,
      missingDocuments: validation.missing_documents_json,
      expiringDocuments: validation.expiring_documents_json,
      medicalFlags: validation.medical_flags_json,
      overallStatus: validation.overall_status,
      overallScore: validation.overall_score,
      summary: validation.summary,
      recommendations: validation.recommendations_json,
      validatedAt: validation.validated_at,
    });
  } catch (err: any) {
    console.log("error in session validate controller: ", err)
    return res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Validation failed. Please try again.",
      retryAfterMs: null,
    });
  }
}

export async function getReportController(req: Request, res: Response) {
  const { sessionId } = req.params as { sessionId: string };

  const session = await findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({
      error: "SESSION_NOT_FOUND",
      message: `Session ${sessionId} does not exist.`,
      retryAfterMs: null,
    });
  }

  const [extractions, validation] = await Promise.all([
    findExtractionsBySession(sessionId),
    findLatestValidationBySession(sessionId),
  ]);

  const report = buildReport(sessionId, extractions, validation);

  return res.status(200).json(report);
}
