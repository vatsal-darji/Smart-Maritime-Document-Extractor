import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import { llmCommands } from "@/helpers/llmCommands";
import { LLMExtractionResult } from "@/types/extraction";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL;

type SupportedMimeType = "image/jpeg" | "image/png" | "application/pdf";

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
  let raw = await callGemini(basePrompt, filePath, mimeType);
  let parsed = extractJSON(raw);

  //LOW confidence → retry with filename/mimetype hints
  if (parsed?.detection?.confidence === "LOW") {
    const hintedPrompt = `${basePrompt}\n\nHint: The file name is "${fileName}" and MIME type is "${mimeType}". Use these as additional signals to improve confidence.`;

    const retryRaw = await callGemini(hintedPrompt, filePath, mimeType);
    const retryParsed = extractJSON(retryRaw);

    // Only use retry result if it actually improved confidence
    if (retryParsed && retryParsed.detection?.confidence !== "LOW") {
      raw = retryRaw;
      parsed = retryParsed;
    }
  }

  //parse failed entirely -> send repair prompt
  if (!parsed) {
    const repairedRaw = await callGeminiRepair(raw);
    parsed = extractJSON(repairedRaw);
    raw = repairedRaw;
  }

  //store raw and surface error to caller
  if (!parsed) {
    const err = new Error("LLM_JSON_PARSE_FAIL") as any;
    err.rawText = raw;
    throw err;
  }

  return { parsed, raw };
}
