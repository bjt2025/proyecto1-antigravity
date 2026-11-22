import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = 'scrypt';

function deriveScryptKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
  keyLength: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization },
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

/**
 * Hashes a plaintext password using scrypt with a unique 16-byte random salt.
 * Any change to this hashing logic requires explicit justification in the plan beforehand.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = await deriveScryptKey(
    password,
    salt,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    KEY_LENGTH
  );

  return `${HASH_PREFIX}$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) {
    return false;
  }

  const [, paramsRaw, saltHex, expectedHex] = parts;
  const paramMap = new Map<string, number>();
  for (const segment of paramsRaw.split(',')) {
    const [k, v] = segment.split('=');
    const parsed = Number.parseInt(v ?? '', 10);
    if (!k || !Number.isFinite(parsed) || parsed <= 0) {
      return false;
    }
    paramMap.set(k, parsed);
  }

  const cost = paramMap.get('N');
  const blockSize = paramMap.get('r');
  const parallelization = paramMap.get('p');
  if (!cost || !blockSize || !parallelization) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(expectedHex, 'hex');
  if (salt.length === 0 || expectedKey.length === 0) {
    return false;
  }

  const derivedKey = await deriveScryptKey(
    password,
    salt,
    cost,
    blockSize,
    parallelization,
    expectedKey.length
  );

  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, expectedKey);
}

const DUMMY_SALT = crypto.randomBytes(SALT_LENGTH);

/** Performs constant-cost scrypt work when an email is not found to mitigate timing enumeration. */
export async function simulatePasswordCheck(password: string): Promise<void> {
  await deriveScryptKey(password, DUMMY_SALT, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);
}
