export const COUNTRY_CODE_OPTIONS = [
  { code: '+1', label: 'US/CA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+64', label: 'New Zealand (+64)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+81', label: 'Japan (+81)' },
  { code: '+82', label: 'South Korea (+82)' },
  { code: '+86', label: 'China (+86)' },
  { code: '+33', label: 'France (+33)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+34', label: 'Spain (+34)' },
  { code: '+39', label: 'Italy (+39)' },
  { code: '+31', label: 'Netherlands (+31)' },
  { code: '+41', label: 'Switzerland (+41)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+966', label: 'Saudi Arabia (+966)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+55', label: 'Brazil (+55)' },
  { code: '+52', label: 'Mexico (+52)' },
];

const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODE_OPTIONS]
  .map((item) => item.code)
  .sort((a, b) => b.length - a.length);

export function splitPhoneForForm(rawPhone, defaultCountryCode = '+1') {
  const raw = String(rawPhone || '').trim();
  if (!raw) return { countryCode: defaultCountryCode, localNumber: '' };

  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact.startsWith('+')) {
    return { countryCode: defaultCountryCode, localNumber: raw };
  }

  const matchedCode = COUNTRY_CODES_BY_LENGTH.find((code) => compact.startsWith(code));
  if (!matchedCode) {
    return { countryCode: defaultCountryCode, localNumber: compact.replace(/^\+/, '') };
  }

  const localNumber = compact.slice(matchedCode.length).replace(/\D/g, '');
  return { countryCode: matchedCode, localNumber };
}

export function normalizePhoneForSubmit(countryCode, localNumber) {
  const number = String(localNumber || '').replace(/\D/g, '');
  if (!number) return '';
  const code = String(countryCode || '+1').trim();
  return `${code}${number}`;
}

export function validatePhone(countryCode, localNumber) {
  const raw = String(localNumber || '').trim();
  const number = raw.replace(/\D/g, '');

  if (!raw) return { valid: true, normalized: '' };

  if (!number) {
    return { valid: false, error: 'Phone number must contain digits.' };
  }

  if (/[a-zA-Z]/.test(raw)) {
    return { valid: false, error: 'Phone number must not contain letters.' };
  }

  const code = String(countryCode || '').trim();
  if (!/^\+\d{1,4}$/.test(code)) {
    return { valid: false, error: 'Please select a valid country code.' };
  }

  if (number.length < 6 || number.length > 14) {
    return { valid: false, error: 'Phone number must be between 6 and 14 digits.' };
  }

  return { valid: true, normalized: `${code}${number}` };
}

export function normalizeUrlForSubmit(rawValue, options = {}) {
  const allowRelativePath = Boolean(options && options.allowRelativePath);
  const value = String(rawValue || '').trim();
  if (!value) return '';

  if (allowRelativePath && /^\//.test(value)) {
    return value;
  }

  if (!/^(https?:\/\/|www\.)/i.test(value)) return null;

  const candidates = /^www\./i.test(value) ? [`https://${value}`] : [value];

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') continue;
      if (!parsed.hostname) continue;
      return parsed.toString();
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function isValidUrlInput(rawValue) {
  return normalizeUrlForSubmit(rawValue) !== null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value) {
  const v = String(value || '').trim();
  if (!v) return { valid: true, normalized: '' };
  if (!EMAIL_RE.test(v)) {
    return { valid: false, error: 'Please enter a valid email address (e.g. user@example.com).' };
  }
  return { valid: true, normalized: v };
}
