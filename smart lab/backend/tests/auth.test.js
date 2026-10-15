import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createAccessToken,
  hashPassword,
  isBcryptHash,
  isValidPassword,
  verifyAccessToken,
  verifyPassword,
} from '../auth.js';

const secret = 'test-only-signing-secret-with-more-than-32-bytes';
const user = { id: 'U123', username: 'lab-user', role: 'technician' };

test('hashes passwords with bcrypt and verifies them', async () => {
  const passwordHash = await hashPassword('correct-horse-battery');

  assert.equal(isBcryptHash(passwordHash), true);
  assert.equal(await verifyPassword('correct-horse-battery', passwordHash), true);
  assert.equal(await verifyPassword('incorrect-password', passwordHash), false);
});

test('verifies legacy SHA-256 hashes to support existing accounts during migration', async () => {
  const legacyHash = crypto.createHash('sha256').update('legacy-password').digest('hex');

  assert.equal(await verifyPassword('legacy-password', legacyHash), true);
  assert.equal(await verifyPassword('wrong-password', legacyHash), false);
  assert.equal(await verifyPassword('legacy-password', 'not-a-hash'), false);
});

test('signs access tokens and rejects tampered or expired tokens', () => {
  const now = Date.UTC(2026, 0, 1);
  const token = createAccessToken(user, secret, now);

  assert.deepEqual(verifyAccessToken(token, secret, now), user);
  assert.equal(verifyAccessToken(token, `${secret}x`, now), null);
  assert.equal(verifyAccessToken(`${token.slice(0, -1)}x`, secret, now), null);
  assert.equal(verifyAccessToken(token, secret, now + 8 * 60 * 60 * 1000), null);
});

test('rejects weak secrets and invalid account roles', () => {
  assert.throws(() => createAccessToken(user, 'short'));
  assert.throws(() => createAccessToken({ ...user, role: 'owner' }, secret));
  assert.equal(isValidPassword('short'), false);
  assert.equal(isValidPassword('at-least-eight'), true);
});
