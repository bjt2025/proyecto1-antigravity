import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { loadConfig, type TransactionsConfig } from './config.js';
import { AppError } from './core/errors.js';
import { logger as defaultLogger, type Logger } from './core/logger.js';
import {
  InMemoryTransactionRepository,
  type TransactionRepository,
} from './repositories/transactionRepository.js';
import { createTransactionRouter } from './routes/transactionRoutes.js';
import { createTransactionService } from './services/transactionService.js';

export interface TransactionsAppDependencies {
  config?: TransactionsConfig;
  transactionRepository?: TransactionRepository;
  logger?: Logger;
  now?: () => number;
}

export interface TransactionsAppContext {
  app: Express;
  config: TransactionsConfig;
  transactionRepository: TransactionRepository;
}

/** Builds the configured Express application for transactions-service. */
export function createTransactionsApp(
  deps: TransactionsAppDependencies = {}
): TransactionsAppContext {
  const config = deps.config ?? loadConfig();
  const logger = deps.logger ?? defaultLogger;
  const transactionRepository =
    deps.transactionRepository ?? new InMemoryTransactionRepository(deps.now);

  const transactionService = createTransactionService({
    config,
    transactionRepository,
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
    res.status(200).json({ status: 'ok', service: 'transactions-service' });
  });

  app.use('/transactions', createTransactionRouter({ transactionService }));

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
    transactionRepository,
  };
}
