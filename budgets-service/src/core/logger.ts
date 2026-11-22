export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: 'budgets-service';
  message: string;
  meta?: Record<string, unknown>;
}

export type LogSink = (level: LogLevel, serialized: string) => void;

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|passwordhash|secret|tokensecret|token|accesstoken|refreshtoken|sessiontoken|authorization|cookie|set-cookie|credentials|credential|jwt|apikey|api_key)$/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SIGNED_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SIGNED_TOKEN_PATTERN, '[REDACTED_TOKEN]');
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeValue(nested, seen);
      }
    }
    return sanitized;
  }

  return String(value);
}

/** Sanitizes metadata so sensitive headers and tokens are never logged in plaintext. */
export function sanitizeLogMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  return sanitizeValue(meta, new WeakSet<object>()) as Record<string, unknown>;
}

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultSink: LogSink = (level, serialized) => {
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
};

/** Creates a structured logger consistent across Centavo microservices. */
export function createLogger(sink: LogSink = defaultSink): Logger {
  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'budgets-service',
      message: redactString(message),
    };

    const sanitizedMeta = sanitizeLogMeta(meta);
    if (sanitizedMeta && Object.keys(sanitizedMeta).length > 0) {
      entry.meta = sanitizedMeta;
    }

    sink(level, JSON.stringify(entry));
  };

  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

export const logger = createLogger();
