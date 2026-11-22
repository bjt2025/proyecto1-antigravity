import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { HttpBudgetClient, type BudgetClient } from './clients/budgetClient.js';
import { loadConfig, type NotificationsConfig } from './config.js';
import { AppError } from './core/errors.js';
import { logger as defaultLogger, type Logger } from './core/logger.js';
import {
  InMemoryNotificationRepository,
  type NotificationRepository,
} from './repositories/notificationRepository.js';
import { createNotificationRouter } from './routes/notificationRoutes.js';
import { createNotificationService } from './services/notificationService.js';

export interface NotificationsAppDependencies {
  config?: NotificationsConfig;
  budgetClient?: BudgetClient;
  notificationRepository?: NotificationRepository;
  logger?: Logger;
  now?: () => number;
}

export interface NotificationsAppContext {
  app: Express;
  config: NotificationsConfig;
  budgetClient: BudgetClient;
  notificationRepository: NotificationRepository;
}

/** Builds the configured Express application for notifications-service. */
export function createNotificationsApp(
  deps: NotificationsAppDependencies = {}
): NotificationsAppContext {
  const config = deps.config ?? loadConfig();
  const logger = deps.logger ?? defaultLogger;
  const budgetClient =
    deps.budgetClient ??
    new HttpBudgetClient({
      baseUrl: config.budgetsServiceUrl,
      timeoutMs: config.budgetsRequestTimeoutMs,
    });
  const notificationRepository =
    deps.notificationRepository ?? new InMemoryNotificationRepository(deps.now);

  const notificationService = createNotificationService({
    config,
    budgetClient,
    notificationRepository,
    logger,
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '16kb' }));

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
    res.status(200).json({ status: 'ok', service: 'notifications-service' });
  });

  app.use('/notifications', createNotificationRouter({ notificationService }));

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
    budgetClient,
    notificationRepository,
  };
}
