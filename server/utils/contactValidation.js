function normalizeHttpUrl(rawValue, options = {}) {
  const allowRelativePath = Boolean(options && options.allowRelativePath);
  if (rawValue === undefined) return undefined;
  const value = String(rawValue || '').trim();
  if (!value) return null;

  if (allowRelativePath && /^\//.test(value)) {
    return value;
  }

  if (!/^(https?:\/\/|www\.)/i.test(value)) {
    const err = new Error('Invalid URL');
    err.code = 'INVALID_URL';
    throw err;
  }

  const candidate = /^www\./i.test(value) ? `https://${value}` : value;

  try {
    const parsed = new URL(candidate);
    const protocol = String(parsed.protocol || '').toLowerCase();
    if ((protocol !== 'http:' && protocol !== 'https:') || !parsed.hostname) {
      const err = new Error('Invalid URL');
      err.code = 'INVALID_URL';
      throw err;
    }
    return parsed.toString();
  } catch (err) {
    if (err.code === 'INVALID_URL') throw err;
    const wrapped = new Error('Invalid URL');
    wrapped.code = 'INVALID_URL';
    throw wrapped;
  }
}

function normalizePhoneWithCountryCode(rawValue) {
  if (rawValue === undefined) return undefined;
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const compact = value.replace(/[\s\-().]/g, '');
  if (!/^\+\d{6,15}$/.test(compact)) {
    const err = new Error('Invalid phone number');
    err.code = 'INVALID_PHONE';
    throw err;
  }
  return compact;
}

module.exports = {
  normalizeHttpUrl,
  normalizePhoneWithCountryCode,
};
