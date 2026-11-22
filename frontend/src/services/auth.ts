import type {
  AuthSession,
  LoginCredentials,
  RegisterCredentials,
  User,
} from '../types';

const AUTH_SERVICE_URL = (
  import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

const SESSION_STORAGE_KEY = 'centavo.session';

interface ApiErrorBody {
  error?: string;
}

async function requestAuth<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_SERVICE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      'No se pudo conectar con auth-service. Verifica que esté activo.'
    );
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error || 'Error de autenticación.');
  }

  return data;
}

function saveSession(session: AuthSession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/** Authenticates an existing user against auth-service. */
export async function loginWithCredentials(
  credentials: LoginCredentials
): Promise<User> {
  const session = await requestAuth<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    }),
  });

  saveSession(session);
  return session.user;
}

/** Registers a new user in auth-service and stores the issued session. */
export async function registerWithCredentials(
  credentials: RegisterCredentials
): Promise<User> {
  const session = await requestAuth<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: credentials.name.trim(),
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
    }),
  });

  saveSession(session);
  return session.user;
}

/** Signs in with the demo account, registering it first if the in-memory store is fresh. */
export async function loginWithDemoCredentials(
  credentials: LoginCredentials
): Promise<User> {
  try {
    return await loginWithCredentials(credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'Credenciales inválidas.') {
      return registerWithCredentials({
        name: 'Usuario Demo',
        email: credentials.email,
        password: credentials.password,
      });
    }
    throw err;
  }
}

/** Verifies the stored token against auth-service and returns the active user or null. */
export async function verifyStoredSession(): Promise<User | null> {
  const session = getStoredSession();
  if (!session?.token) return null;

  try {
    const data = await requestAuth<{ valid: boolean; user: User }>(
      '/auth/verify',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      }
    );
    return data.valid ? data.user : null;
  } catch {
    clearStoredSession();
    return null;
  }
}

/** Reads the active session from sessionStorage if present. */
export function getStoredSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.user || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Reads the active user from sessionStorage if present. */
export function getStoredUser(): User | null {
  return getStoredSession()?.user ?? null;
}

/** Revokes the current session in auth-service and clears local storage. */
export async function logoutSession(): Promise<void> {
  const session = getStoredSession();
  clearStoredSession();

  if (!session?.token) return;
  try {
    await fetch(`${AUTH_SERVICE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
  } catch {
    // Best-effort revocation; local session is already cleared.
  }
}

/** Clears the current user session from storage. */
export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
