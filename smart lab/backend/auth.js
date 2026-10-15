import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;
const VALID_ROLES = new Set(['admin', 'technician', 'pathologist']);

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const getSigningKey = (secret) => {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  return secret;
};

export const hashPassword = (password) => bcrypt.hash(String(password), 12);

export const isBcryptHash = (passwordHash) => /^\$2[aby]\$/.test(String(passwordHash || ''));

export const verifyPassword = async (password, passwordHash) => {
  const storedHash = String(passwordHash || '');
  if (isBcryptHash(storedHash)) return bcrypt.compare(String(password), storedHash);

  if (!/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const legacyHash = crypto.createHash('sha256').update(String(password)).digest();
  const savedHash = Buffer.from(storedHash, 'hex');
  return savedHash.length === legacyHash.length && crypto.timingSafeEqual(savedHash, legacyHash);
};

export const createAccessToken = (user, secret, now = Date.now()) => {
  const key = getSigningKey(secret);
  if (!user?.id || !user?.username || !VALID_ROLES.has(user.role)) {
    throw new Error('A valid user identity and role are required to issue an access token.');
  }

  const issuedAt = Math.floor(now / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: String(user.id),
    username: String(user.username),
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  });
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', key).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

export const verifyAccessToken = (token, secret, now = Date.now()) => {
  try {
    const key = getSigningKey(secret);
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const expected = crypto.createHmac('sha256', key)
      .update(`${headerPart}.${payloadPart}`)
      .digest();
    const supplied = Buffer.from(signaturePart, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const currentTime = Math.floor(now / 1000);
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
      || payload.iat > currentTime || payload.exp <= currentTime
      || !payload.sub || !payload.username || !VALID_ROLES.has(payload.role)) return null;

    return { id: String(payload.sub), username: String(payload.username), role: payload.role };
  } catch {
    return null;
  }
};

export const isValidPassword = (password) => (
  typeof password === 'string'
  && Buffer.byteLength(password, 'utf8') >= 8
  && Buffer.byteLength(password, 'utf8') <= 72
);
