import crypto from 'node:crypto';
import type { SessionRecord } from '../types/auth.js';

export interface CreateSessionParams {
  userId: string;
  expiresAt: string;
}

export interface SessionRepository {
  create(params: CreateSessionParams): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  revoke(id: string): Promise<void>;
}

/**
 * Default in-memory session repository.
 * Stores only session metadata (never plaintext tokens).
 */
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessionsById = new Map<string, SessionRecord>();

  async create(params: CreateSessionParams): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      userId: params.userId,
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresAt,
      revokedAt: null,
    };

    this.sessionsById.set(record.id, record);
    return { ...record };
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const record = this.sessionsById.get(id);
    return record ? { ...record } : null;
  }

  async revoke(id: string): Promise<void> {
    const record = this.sessionsById.get(id);
    if (!record || record.revokedAt !== null) return;
    record.revokedAt = new Date().toISOString();
  }
}
