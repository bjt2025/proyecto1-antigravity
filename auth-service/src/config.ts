import crypto from 'node:crypto';

export interface AuthConfig {
  port: number;
  corsOrigin: string;
  tokenSecret: string;
  sessionTtlSeconds: number;
  nodeEnv: string;
  usesEphemeralSecret: boolean;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`La variable de entorno ${name} debe ser un entero positivo.`);
  }
  return parsed;
}

/** Loads and validates service configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const port = parsePositiveInt(env.PORT, 3001, 'PORT');
  const sessionTtlSeconds = parsePositiveInt(
    env.SESSION_TTL_SECONDS,
    86400,
    'SESSION_TTL_SECONDS'
  );
  const corsOrigin = env.CORS_ORIGIN?.trim() || 'http://localhost:5173';

  const configuredSecret = env.AUTH_TOKEN_SECRET?.trim();
  if (nodeEnv === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error(
      'AUTH_TOKEN_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.'
    );
  }

  const usesEphemeralSecret = !configuredSecret;
  const tokenSecret = configuredSecret || crypto.randomBytes(32).toString('hex');

  return {
    port,
    corsOrigin,
    tokenSecret,
    sessionTtlSeconds,
    nodeEnv,
    usesEphemeralSecret,
  };
}
