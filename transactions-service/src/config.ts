export interface TransactionsConfig {
  port: number;
  corsOrigin: string;
  defaultCurrency: string;
  nodeEnv: string;
}

const CURRENCY_REGEX = /^[A-Z]{3}$/;

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`La variable de entorno ${name} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseCurrency(raw: string | undefined, fallback: string): string {
  const currency = (raw?.trim() || fallback).toUpperCase();
  if (!CURRENCY_REGEX.test(currency)) {
    throw new Error('La variable de entorno DEFAULT_CURRENCY debe ser un código ISO de 3 letras.');
  }
  return currency;
}

/** Loads and validates service configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TransactionsConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const port = parsePositiveInt(env.PORT, 3002, 'PORT');
  const corsOrigin = env.CORS_ORIGIN?.trim() || 'http://localhost:5173';
  const defaultCurrency = parseCurrency(env.DEFAULT_CURRENCY, 'PEN');

  return {
    port,
    corsOrigin,
    defaultCurrency,
    nodeEnv,
  };
}
