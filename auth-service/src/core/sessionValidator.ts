import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from './errors.js';
import type { SessionTokenClaims } from './tokenSigner.js';
import type { SessionRepository } from '../repositories/sessionRepository.js';
import { toPublicUser, type UserRepository } from '../repositories/userRepository.js';
import type { VerifiedSession } from '../types/auth.js';

export interface AuthenticatedRequest extends Request {
  auth?: VerifiedSession;
}

export interface SessionValidatorDeps {
  tokenSecret: string;
  sessionRepository: SessionRepository;
  userRepository: UserRepository;
  now?: () => number;
}

export interface SessionValidator {
  validateToken(token: string): Promise<VerifiedSession>;
  validateAuthorizationHeader(authorizationHeader?: string): Promise<VerifiedSession>;
  requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
}

function parseBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader) {
    throw new UnauthorizedError('Falta el encabezado de autorización.');
  }

  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    throw new UnauthorizedError('Formato de autorización inválido. Usa Bearer <token>.');
  }

  return parts[1];
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const raw = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function verifyAndDecodeClaims(
  token: string,
  secret: string,
  nowMs: number
): SessionTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  const header = decodeBase64UrlJson<{ alg?: string; typ?: string }>(headerB64);
  if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(signatureB64, 'base64url');
  } catch {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  const claims = decodeBase64UrlJson<Partial<SessionTokenClaims>>(payloadB64);
  if (
    !claims ||
    typeof claims.sid !== 'string' ||
    typeof claims.sub !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    throw new UnauthorizedError('Token de sesión inválido.');
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (claims.exp <= nowSeconds) {
    throw new UnauthorizedError('La sesión ha expirado.');
  }

  return {
    sid: claims.sid,
    sub: claims.sub,
    iat: claims.iat,
    exp: claims.exp,
  };
}

/**
 * Single central module for ALL session validation in auth-service.
 * Every verification endpoint and protected route middleware must delegate here.
 */
export function createSessionValidator(deps: SessionValidatorDeps): SessionValidator {
  const getNowMs = deps.now ?? (() => Date.now());

  const validateToken = async (token: string): Promise<VerifiedSession> => {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new UnauthorizedError('Token de sesión requerido.');
    }

    const nowMs = getNowMs();
    const claims = verifyAndDecodeClaims(trimmed, deps.tokenSecret, nowMs);

    const session = await deps.sessionRepository.findById(claims.sid);
    if (!session || session.userId !== claims.sub) {
      throw new UnauthorizedError('Sesión no encontrada o inválida.');
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedError('La sesión fue cerrada o revocada.');
    }

    if (Date.parse(session.expiresAt) <= nowMs) {
      throw new UnauthorizedError('La sesión ha expirado.');
    }

    const user = await deps.userRepository.findById(claims.sub);
    if (!user) {
      throw new UnauthorizedError('Usuario asociado a la sesión no encontrado.');
    }

    return {
      valid: true,
      isAuthenticated: true,
      user: toPublicUser(user),
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
    };
  };

  const validateAuthorizationHeader = async (
    authorizationHeader?: string
  ): Promise<VerifiedSession> => {
    const token = parseBearerToken(authorizationHeader);
    return validateToken(token);
  };

  const requireAuth = async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      req.auth = await validateAuthorizationHeader(req.headers.authorization);
      next();
    } catch (error) {
      next(error);
    }
  };

  return {
    validateToken,
    validateAuthorizationHeader,
    requireAuth,
  };
}
