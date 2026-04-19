import { queryOne } from '@/db/index';
import { SessionRow } from '@/types/db';
import { v4 as uuidv4 } from 'uuid';

export async function findOrCreateSession(sessionId?: string): Promise<SessionRow> {
  const id = sessionId ?? uuidv4();

  // Try to find existing first
  if (sessionId) {
    const existing = await queryOne<SessionRow>(
      `SELECT * FROM sessions WHERE id = $1 AND deleted_at IS NULL`,
      [sessionId],
    );
    if (existing) return existing;
  }

  // Create new
  const row = await queryOne<SessionRow>(
    `INSERT INTO sessions (id) VALUES ($1) RETURNING *`,
    [id],
  );

  return row!;
}

export async function findSessionById(sessionId: string): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    `SELECT * FROM sessions WHERE id = $1 AND deleted_at IS NULL`,
    [sessionId],
  );
}