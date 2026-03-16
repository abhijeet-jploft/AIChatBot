const crypto = require('crypto');

const SALT_LEN = 16;
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const TOKEN_BYTES = 32;
const SESSION_DAYS = 7;

function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = crypto.scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const computed = crypto.scryptSync(plain, salt, KEY_LEN, SCRYPT_OPTS).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function getSessionExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  getSessionExpiry,
};
