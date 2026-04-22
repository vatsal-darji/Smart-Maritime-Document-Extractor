import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import { llmCommands } from "@/helpers/llmCommands";
import { LLMExtractionResult } from "@/types/extraction";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL;

type SupportedMimeType = "image/jpeg" | "image/png" | "application/pdf";

export type LLMErrorSource = "GEMINI" | "LLM" | "FILE";

export class LLMServiceError extends Error {
  source: LLMErrorSource;
  code: string;
  status?: string;
  httpStatus?: number;
  retryable: boolean;
  raw?: unknown;
  rawText?: string;

  constructor(opts: {
    source: LLMErrorSource;
    code: string;
    message: string;
    status?: string;
    httpStatus?: number;
    retryable?: boolean;
    raw?: unknown;
    rawText?: string;
  }) {
    super(opts.message);
    this.name = "LLMServiceError";
    this.source = opts.source;
    this.code = opts.code;
    this.status = opts.status;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? false;
    this.raw = opts.raw;
    this.rawText = opts.rawText;
  }
}

function parseGeminiError(err: any): {
  code: string;
  message: string;
  status?: string;
  httpStatus?: number;
  retryable: boolean;
  raw?: unknown;
} {
  const fallbackMessage = err?.message ?? "Gemini request failed";
  let parsed: any = null;

  if (typeof err?.message === "string") {
    try {
      parsed = JSON.parse(err.message);
    } catch {}
  }

  const geminiError = parsed?.error ?? err?.error ?? null;
  const httpStatus = Number(geminiError?.code ?? err?.status ?? err?.code) || undefined;
  const status = geminiError?.status ?? err?.statusText;
  const message = geminiError?.message ?? fallbackMessage;
  const code = status ? `GEMINI_${status}` : `GEMINI_${httpStatus ?? "ERROR"}`;
  const retryable =
    httpStatus === 429 ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504 ||
    status === "UNAVAILABLE" ||
    status === "RESOURCE_EXHAUSTED";

  return {
    code,
    message,
    status,
    httpStatus,
    retryable,
    raw: parsed ?? err,
  };
}

function normalizeLLMError(err: any): LLMServiceError {
  if (err instanceof LLMServiceError) return err;

  if (err?.message === "LLM_TIMEOUT") {
    return new LLMServiceError({
      source: "LLM",
      code: "LLM_TIMEOUT",
      message: "LLM request timed out.",
      retryable: true,
    });
  }

  if (err?.code === "ENOENT") {
    return new LLMServiceError({
      source: "FILE",
      code: "FILE_NOT_FOUND",
      message: err.message,
      retryable: false,
      raw: err,
    });
  }

  const gemini = parseGeminiError(err);
  return new LLMServiceError({
    source: "GEMINI",
    code: gemini.code,
    message: gemini.message,
    status: gemini.status,
    httpStatus: gemini.httpStatus,
    retryable: gemini.retryable,
    raw: gemini.raw,
  });
}

export function serializeLLMError(err: any) {
  const normalized = normalizeLLMError(err);

  return {
    source: normalized.source,
    code: normalized.code,
    message: normalized.message,
    status: normalized.status,
    httpStatus: normalized.httpStatus,
    retryable: normalized.retryable,
    raw: normalized.raw,
    rawText: normalized.rawText,
  };
}

export function extractJSON(raw: string): LLMExtractionResult | null {
  // direct parse
  try {
    return JSON.parse(raw);
  } catch {}

  // find outermost { } boundary
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  //to remove markdown
  try {
      return JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
    } catch {}

  return null;
}

//gemini setup
const LLM_TIMEOUT_MS = 30_000;

const ai = new GoogleGenAI({
  apiKey:
    GEMINI_API_KEY ??
    (() => {
      throw new Error("Gemini key is not set");
    })(),
});

async function callGemini(
  prompt: string,
  filePath: string,
  mimeType: SupportedMimeType,
): Promise<string> {
  const base64Data = fs.readFileSync(filePath).toString("base64");

  const call = ai.models.generateContent({
    model: GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ],
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("LLM_TIMEOUT")), LLM_TIMEOUT_MS),
  );

  const response = await Promise.race([call, timeout]);
  return response.text ?? "";
}

//repair call

async function callGeminiRepair(brokenJson: string): Promise<string> {
  const repairPrompt = `The following text was returned by an LLM but is not valid JSON.
Extract the JSON object from it and return ONLY valid JSON: no markdown, no code fences, no explanation.

Raw response:
${brokenJson}`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: [{ text: repairPrompt }],
  });

  return response.text ?? "";
}

//Public API

export interface ExtractDocumentResult {
  parsed: LLMExtractionResult;
  raw: string;
}

export async function extractDocument(
  filePath: string,
  mimeType: SupportedMimeType,
  fileName: string,
): Promise<ExtractDocumentResult> {
  const basePrompt = llmCommands.extract_command;

  //standard extraction
  let raw: string;
  try {
    raw = await callGemini(basePrompt, filePath, mimeType);
  } catch (err) {
    throw normalizeLLMError(err);
  }

  let parsed = extractJSON(raw);

  //LOW confidence → retry with filename/mimetype hints
  if (parsed?.detection?.confidence === "LOW") {
    const hintedPrompt = `${basePrompt}\n\nHint: The file name is "${fileName}" and MIME type is "${mimeType}". Use these as additional signals to improve confidence.`;

    let retryRaw: string;
    try {
      retryRaw = await callGemini(hintedPrompt, filePath, mimeType);
    } catch (err) {
      throw normalizeLLMError(err);
    }

    const retryParsed = extractJSON(retryRaw);

    // Only use retry result if it actually improved confidence
    if (retryParsed && retryParsed.detection?.confidence !== "LOW") {
      raw = retryRaw;
      parsed = retryParsed;
    }
  }

  //parse failed entirely -> send repair prompt
  if (!parsed) {
    let repairedRaw: string;
    try {
      repairedRaw = await callGeminiRepair(raw);
    } catch (err) {
      throw normalizeLLMError(err);
    }

    parsed = extractJSON(repairedRaw);
    raw = repairedRaw;
  }

  //store raw and surface error to caller
  if (!parsed) {
    const err = new LLMServiceError({
      source: "LLM",
      code: "LLM_JSON_PARSE_FAIL",
      message: "LLM response could not be parsed as JSON.",
      retryable: false,
      rawText: raw,
    });
    throw err;
  }

  return { parsed, raw };
}
