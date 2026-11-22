import assert from 'node:assert/strict';
import http from 'node:http';
import { after, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createAuthApp } from '../src/app.js';
import type { AuthConfig } from '../src/config.js';
import { createLogger } from '../src/core/logger.js';
import { hashPassword, verifyPassword } from '../src/core/passwordHasher.js';

function createTestConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    port: 0,
    corsOrigin: 'http://localhost:5173',
    tokenSecret: 'test-secret-key-with-more-than-32-characters',
    sessionTtlSeconds: 3600,
    nodeEnv: 'test',
    usesEphemeralSecret: false,
    ...overrides,
  };
}

async function startTestServer(options: {
  config?: Partial<AuthConfig>;
  now?: () => number;
} = {}) {
  const capturedLogs: string[] = [];
  const logger = createLogger((_level, serialized) => {
    capturedLogs.push(serialized);
  });

  const context = createAuthApp({
    config: createTestConfig(options.config),
    logger,
    now: options.now,
  });

  const server = http.createServer(context.app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    capturedLogs,
    context,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('auth-service base structure', () => {
  describe('passwordHasher', () => {
    it('hashes passwords with unique salts and verifies in constant time', async () => {
      const hashA = await hashPassword('clave-segura-123');
      const hashB = await hashPassword('clave-segura-123');

      assert.notEqual(hashA, hashB);
      assert.ok(hashA.startsWith('scrypt$'));
      assert.equal(await verifyPassword('clave-segura-123', hashA), true);
      assert.equal(await verifyPassword('clave-incorrecta', hashA), false);
    });
  });

  describe('logger credential and token redaction', () => {
    it('redacts sensitive keys and bearer/signed tokens', () => {
      const lines: string[] = [];
      const logger = createLogger((_level, serialized) => lines.push(serialized));

      logger.info('Auth debug test', {
        password: 'super-secret-password',
        token: 'abc.def.ghi',
        nested: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload123.sig123456',
          safeField: 'visible',
        },
        messageWithBearer: 'Failed header Bearer my-raw-token-12345',
      });

      assert.equal(lines.length, 1);
      const output = lines[0];
      assert.equal(output.includes('super-secret-password'), false);
      assert.equal(output.includes('abc.def.ghi'), false);
      assert.equal(output.includes('eyJhbGciOiJIUzI1NiJ9'), false);
      assert.equal(output.includes('my-raw-token-12345'), false);
      assert.ok(output.includes('[REDACTED]'));
      assert.ok(output.includes('visible'));
    });
  });

  describe('HTTP auth flow (register, login, verify, logout)', () => {
    const cleanups: Array<() => Promise<void>> = [];

    after(async () => {
      await Promise.all(cleanups.map((fn) => fn()));
    });

    it('supports health check, registration, login, session verification, and logout without logging secrets', async () => {
      let currentTimeMs = Date.parse('2026-11-21T22:00:00.000Z');
      const srv = await startTestServer({ now: () => currentTimeMs });
      cleanups.push(srv.close);

      // 1. Health check
      const healthRes = await fetch(`${srv.baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthBody = (await healthRes.json()) as { status: string; service: string };
      assert.equal(healthBody.status, 'ok');
      assert.equal(healthBody.service, 'auth-service');

      // 2. Register
      const rawPassword = 'MiPasswordSecreto2026!';
      const registerRes = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ana Pérez',
          email: 'Ana@Centavo.app',
          password: rawPassword,
        }),
      });

      assert.equal(registerRes.status, 201);
      const registerBody = (await registerRes.json()) as {
        user: { id: string; name: string; email: string; passwordHash?: string };
        token: string;
        expiresAt: string;
      };

      assert.equal(registerBody.user.name, 'Ana Pérez');
      assert.equal(registerBody.user.email, 'ana@centavo.app');
      assert.equal(registerBody.user.passwordHash, undefined);
      assert.ok(registerBody.token.length > 20);

      // 3. Duplicate registration returns 409
      const dupRes = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ana Duplicada',
          email: 'ana@centavo.app',
          password: rawPassword,
        }),
      });
      assert.equal(dupRes.status, 409);

      // 4. Verify initial registration token via /auth/verify and /auth/session
      const verifyRes = await fetch(`${srv.baseUrl}/auth/verify`, {
        headers: { Authorization: `Bearer ${registerBody.token}` },
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = (await verifyRes.json()) as {
        valid: boolean;
        isAuthenticated: boolean;
        user: { id: string; email: string };
        session: { id: string };
      };
      assert.equal(verifyBody.valid, true);
      assert.equal(verifyBody.isAuthenticated, true);
      assert.equal(verifyBody.user.id, registerBody.user.id);

      const sessionAliasRes = await fetch(`${srv.baseUrl}/auth/session`, {
        headers: { Authorization: `Bearer ${registerBody.token}` },
      });
      assert.equal(sessionAliasRes.status, 200);

      // 5. Login with invalid credentials returns 401
      const badLoginRes = await fetch(`${srv.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ana@centavo.app',
          password: 'wrong-password',
        }),
      });
      assert.equal(badLoginRes.status, 401);

      // 6. Login with valid credentials returns 200 and a new valid token
      const loginRes = await fetch(`${srv.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: '  ana@centavo.app ',
          password: rawPassword,
        }),
      });
      assert.equal(loginRes.status, 200);
      const loginBody = (await loginRes.json()) as {
        user: { id: string; email: string };
        token: string;
      };
      assert.equal(loginBody.user.id, registerBody.user.id);
      assert.notEqual(loginBody.token, registerBody.token);

      // 7. Tampered or missing token fails verification
      const missingAuthRes = await fetch(`${srv.baseUrl}/auth/verify`);
      assert.equal(missingAuthRes.status, 401);
      const missingAuthBody = (await missingAuthRes.json()) as {
        valid: boolean;
        isAuthenticated: boolean;
      };
      assert.equal(missingAuthBody.valid, false);
      assert.equal(missingAuthBody.isAuthenticated, false);

      const tamperedToken = `${loginBody.token.slice(0, -4)}xxxx`;
      const tamperedRes = await fetch(`${srv.baseUrl}/auth/verify`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      assert.equal(tamperedRes.status, 401);

      // 8. Logout revokes the session so verify fails afterwards
      const logoutRes = await fetch(`${srv.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      assert.equal(logoutRes.status, 200);

      const verifyAfterLogoutRes = await fetch(`${srv.baseUrl}/auth/verify`, {
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      assert.equal(verifyAfterLogoutRes.status, 401);

      // 9. Expired session fails verification
      currentTimeMs += 3601 * 1000;
      const expiredRes = await fetch(`${srv.baseUrl}/auth/verify`, {
        headers: { Authorization: `Bearer ${registerBody.token}` },
      });
      assert.equal(expiredRes.status, 401);

      // 10. Confirm zero plaintext passwords or tokens appeared in logs
      const allLogs = srv.capturedLogs.join('\n');
      assert.equal(allLogs.includes(rawPassword), false);
      assert.equal(allLogs.includes('wrong-password'), false);
      assert.equal(allLogs.includes(registerBody.token), false);
      assert.equal(allLogs.includes(loginBody.token), false);
    });

    it('validates input fields on register and login', async () => {
      const srv = await startTestServer();
      cleanups.push(srv.close);

      const badRegister = await fetch(`${srv.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'A',
          email: 'not-an-email',
          password: '123',
        }),
      });
      assert.equal(badRegister.status, 400);

      const badLogin = await fetch(`${srv.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: '',
        }),
      });
      assert.equal(badLogin.status, 400);
    });
  });
});
