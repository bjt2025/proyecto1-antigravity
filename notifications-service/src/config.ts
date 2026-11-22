export interface NotificationsConfig {
  port: number;
  corsOrigin: string;
  budgetsServiceUrl: string;
  budgetsRequestTimeoutMs: number;
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

function parseServiceUrl(raw: string | undefined, fallback: string, name: string): string {
  const candidate = (raw?.trim() || fallback).replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`La variable de entorno ${name} debe ser una URL válida.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`La variable de entorno ${name} debe usar protocolo http o https.`);
  }
  return candidate;
}

/** Loads and validates service configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): NotificationsConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const port = parsePositiveInt(env.PORT, 3004, 'PORT');
  const corsOrigin = env.CORS_ORIGIN?.trim() || 'http://localhost:5173';
  const budgetsServiceUrl = parseServiceUrl(
    env.BUDGETS_SERVICE_URL,
    'http://localhost:3003',
    'BUDGETS_SERVICE_URL'
  );
  const budgetsRequestTimeoutMs = parsePositiveInt(
    env.BUDGETS_REQUEST_TIMEOUT_MS,
    3000,
    'BUDGETS_REQUEST_TIMEOUT_MS'
  );
  const defaultCurrency = parseCurrency(env.DEFAULT_CURRENCY, 'PEN');

  return {
    port,
    corsOrigin,
    budgetsServiceUrl,
    budgetsRequestTimeoutMs,
    defaultCurrency,
    nodeEnv,
  };
}
