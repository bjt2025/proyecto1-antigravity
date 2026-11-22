import crypto from 'node:crypto';

export interface SessionTokenClaims {
  sid: string;
  sub: string;
  iat: number;
  exp: number;
}

const TOKEN_HEADER_B64 = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  'utf8'
).toString('base64url');

/**
 * Signs a session token using HMAC-SHA256.
 * Note: Token parsing and validation belong exclusively in sessionValidator.ts.
 */
export function signSessionToken(claims: SessionTokenClaims, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signingInput = `${TOKEN_HEADER_B64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}
