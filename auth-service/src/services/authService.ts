import type { AuthConfig } from '../config.js';
import { ConflictError, UnauthorizedError, ValidationError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import {
  hashPassword,
  simulatePasswordCheck,
  verifyPassword,
} from '../core/passwordHasher.js';
import { signSessionToken } from '../core/tokenSigner.js';
import type { SessionRepository } from '../repositories/sessionRepository.js';
import { toPublicUser, type UserRepository } from '../repositories/userRepository.js';
import type { AuthResult, LoginInput, PublicUser, RegisterInput } from '../types/auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

export interface AuthServiceDeps {
  config: AuthConfig;
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  logger: Logger;
  now?: () => number;
}

export interface AuthService {
  register(input: Partial<RegisterInput>): Promise<AuthResult>;
  login(input: Partial<LoginInput>): Promise<AuthResult>;
  logout(sessionId: string): Promise<void>;
}

function normalizeAndValidateEmail(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('Ingresa un correo electrónico válido.');
  }
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    throw new ValidationError('Ingresa un correo electrónico válido.');
  }
  return email;
}

function validateName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('El nombre es obligatorio.');
  }
  const name = raw.trim();
  if (name.length < 2 || name.length > 100) {
    throw new ValidationError('El nombre debe tener entre 2 y 100 caracteres.');
  }
  return name;
}

function validatePassword(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('La contraseña debe ser un texto válido.');
  }
  if (raw.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
  }
  if (raw.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña no debe superar los ${MAX_PASSWORD_LENGTH} caracteres.`
    );
  }
  return raw;
}

/** Coordinates user registration, login, and session issuance/revocation. */
export function createAuthService(deps: AuthServiceDeps): AuthService {
  const getNowMs = deps.now ?? (() => Date.now());

  const issueSession = async (user: PublicUser): Promise<AuthResult> => {
    const nowMs = getNowMs();
    const iat = Math.floor(nowMs / 1000);
    const exp = iat + deps.config.sessionTtlSeconds;
    const expiresAt = new Date(exp * 1000).toISOString();

    const session = await deps.sessionRepository.create({
      userId: user.id,
      expiresAt,
    });

    const token = signSessionToken(
      {
        sid: session.id,
        sub: user.id,
        iat,
        exp,
      },
      deps.config.tokenSecret
    );

    return {
      user,
      token,
      expiresAt,
    };
  };

  const register = async (input: Partial<RegisterInput>): Promise<AuthResult> => {
    const name = validateName(input?.name);
    const email = normalizeAndValidateEmail(input?.email);
    const password = validatePassword(input?.password);

    const existing = await deps.userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Ya existe una cuenta registrada con este correo electrónico.');
    }

    const passwordHash = await hashPassword(password);
    const createdUser = await deps.userRepository.create({
      name,
      email,
      passwordHash,
    });

    const publicUser = toPublicUser(createdUser);
    const result = await issueSession(publicUser);

    deps.logger.info('Usuario registrado exitosamente', { userId: publicUser.id });
    return result;
  };

  const login = async (input: Partial<LoginInput>): Promise<AuthResult> => {
    const email = normalizeAndValidateEmail(input?.email);
    if (typeof input?.password !== 'string' || input.password.length === 0) {
      throw new ValidationError('La contraseña es obligatoria.');
    }
    const password = input.password;

    const user = await deps.userRepository.findByEmail(email);
    if (!user) {
      await simulatePasswordCheck(password);
      deps.logger.warn('Intento de login fallido', { reason: 'invalid_credentials' });
      throw new UnauthorizedError('Credenciales inválidas.');
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      deps.logger.warn('Intento de login fallido', {
        reason: 'invalid_credentials',
        userId: user.id,
      });
      throw new UnauthorizedError('Credenciales inválidas.');
    }

    const publicUser = toPublicUser(user);
    const result = await issueSession(publicUser);

    deps.logger.info('Inicio de sesión exitoso', { userId: publicUser.id });
    return result;
  };

  const logout = async (sessionId: string): Promise<void> => {
    await deps.sessionRepository.revoke(sessionId);
    deps.logger.info('Sesión revocada', { sessionId });
  };

  return {
    register,
    login,
    logout,
  };
}
