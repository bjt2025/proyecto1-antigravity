export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface UserRecord extends PublicUser {
  passwordHash: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: PublicUser;
  token: string;
  expiresAt: string;
}

export interface VerifiedSession {
  valid: true;
  isAuthenticated: true;
  user: PublicUser;
  session: {
    id: string;
    expiresAt: string;
  };
}
