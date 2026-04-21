import { Request, Response } from "express";
import { pool } from "@/db";
import { extractionQueue } from "@/helpers/queue";

const startTime = Date.now();

export async function healthController(_req: Request, res: Response) {
  const checks = await Promise.allSettled([
    pool.query("SELECT 1"),
    extractionQueue.getWorkers(),
  ]);

  const dbOk = checks[0].status === "fulfilled";
  const queueOk = checks[1].status === "fulfilled";

  // LLM check — just verify key is configured, don't burn tokens
  const llmOk = Boolean(process.env.GEMINI_API_KEY);

  const allOk = dbOk && queueOk && llmOk;

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? "OK" : "DEGRADED",
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    dependencies: {
      database: dbOk ? "OK" : "ERROR",
      queue: queueOk ? "OK" : "ERROR",
      llmProvider: llmOk ? "OK" : "ERROR",
    },
    timestamp: new Date(),
  });
}
