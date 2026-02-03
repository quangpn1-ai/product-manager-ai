import { query, toCamelCase } from '../index.js';
import type { Session } from '../../types/index.js';

interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

export class SessionRepository {
  async findById(id: string): Promise<Session | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM sessions WHERE id = $1',
      [id]
    );
    return result.rows[0] ? toCamelCase<Session>(result.rows[0]) : null;
  }

  async findByTokenHash(refreshTokenHash: string): Promise<Session | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM sessions
       WHERE refresh_token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
      [refreshTokenHash]
    );
    return result.rows[0] ? toCamelCase<Session>(result.rows[0]) : null;
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.userId, input.refreshTokenHash, input.userAgent ?? null, input.ipAddress ?? null, input.expiresAt]
    );
    return toCamelCase<Session>(result.rows[0]!);
  }

  async revoke(id: string): Promise<void> {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1',
      [id]
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  async revokeByTokenHash(refreshTokenHash: string): Promise<void> {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1',
      [refreshTokenHash]
    );
  }

  async deleteExpired(): Promise<number> {
    const result = await query(
      'DELETE FROM sessions WHERE expires_at < now() OR revoked_at IS NOT NULL',
      []
    );
    return result.rowCount ?? 0;
  }
}

export const sessionRepository = new SessionRepository();
