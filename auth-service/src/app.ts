import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { loadConfig, type AuthConfig } from './config.js';
import { AppError, UnauthorizedError } from './core/errors.js';
import { logger as defaultLogger, type Logger } from './core/logger.js';
import {
  createSessionValidator,
  type SessionValidator,
} from './core/sessionValidator.js';
import {
  InMemorySessionRepository,
  type SessionRepository,
} from './repositories/sessionRepository.js';
import {
  InMemoryUserRepository,
  type UserRepository,
} from './repositories/userRepository.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createAuthService } from './services/authService.js';

export interface AuthAppDependencies {
  config?: AuthConfig;
  userRepository?: UserRepository;
  sessionRepository?: SessionRepository;
  logger?: Logger;
  now?: () => number;
}

export interface AuthAppContext {
  app: Express;
  config: AuthConfig;
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  sessionValidator: SessionValidator;
}

/** Builds the configured Express application for auth-service. */
export function createAuthApp(deps: AuthAppDependencies = {}): AuthAppContext {
  const config = deps.config ?? loadConfig();
  const logger = deps.logger ?? defaultLogger;
  const userRepository = deps.userRepository ?? new InMemoryUserRepository();
  const sessionRepository = deps.sessionRepository ?? new InMemorySessionRepository();

  if (config.usesEphemeralSecret && config.nodeEnv !== 'test') {
    logger.warn(
      'AUTH_TOKEN_SECRET no está definido; usando secreto efímero en memoria para desarrollo.'
    );
  }

  const sessionValidator = createSessionValidator({
    tokenSecret: config.tokenSecret,
    sessionRepository,
    userRepository,
    now: deps.now,
  });

  const authService = createAuthService({
    config,
    userRepository,
    sessionRepository,
    logger,
    now: deps.now,
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '16kb' }));

  // Safe HTTP access log: logs only method, path, status, and latency — never bodies or auth headers.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-service' });
  });

  app.use('/auth', createAuthRouter({ authService, sessionValidator }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.', code: 'NOT_FOUND' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'Cuerpo JSON inválido.',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    if (err instanceof UnauthorizedError) {
      res.status(err.statusCode).json({
        valid: false,
        isAuthenticated: false,
        error: err.message,
        code: err.code,
      });
      return;
    }

    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
      return;
    }

    logger.error('Error interno no controlado', { error: err });
    res.status(500).json({
      error: 'Error interno del servidor.',
      code: 'INTERNAL_ERROR',
    });
  });

  return {
    app,
    config,
    userRepository,
    sessionRepository,
    sessionValidator,
  };
}
