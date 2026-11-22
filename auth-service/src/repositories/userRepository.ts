import crypto from 'node:crypto';
import type { PublicUser, UserRecord } from '../types/auth.js';

export interface CreateUserParams {
  name: string;
  email: string;
  passwordHash: string;
}

export interface UserRepository {
  create(params: CreateUserParams): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

/** Maps a stored user record to a safe public representation without passwordHash. */
export function toPublicUser(record: UserRecord): PublicUser {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
  };
}

/** Default in-memory user repository for the auth-service base scaffold. */
export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdsByEmail = new Map<string, string>();

  async create(params: CreateUserParams): Promise<UserRecord> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const record: UserRecord = {
      id: crypto.randomUUID(),
      name: params.name.trim(),
      email: normalizedEmail,
      passwordHash: params.passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.usersById.set(record.id, record);
    this.userIdsByEmail.set(normalizedEmail, record.id);
    return { ...record };
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const id = this.userIdsByEmail.get(normalizedEmail);
    if (!id) return null;
    const record = this.usersById.get(id);
    return record ? { ...record } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const record = this.usersById.get(id);
    return record ? { ...record } : null;
  }
}
