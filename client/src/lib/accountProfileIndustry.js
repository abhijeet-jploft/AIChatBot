export const INDUSTRY_PRESETS = [
  'Technology / Software',
  'Retail & E-commerce',
  'Healthcare',
  'Finance & Insurance',
  'Real Estate',
  'Education',
  'Hospitality & Travel',
  'Manufacturing',
  'Professional Services',
];

export const OTHER_VALUE = 'Other';

export function parseIndustryFromApi(saved) {
  const raw = String(saved || '').trim();
  if (!raw) return { select: '', other: '' };

  const m = /^Other:\s*(.*)$/i.exec(raw);
  if (m) return { select: OTHER_VALUE, other: (m[1] || '').trim() };

  if (INDUSTRY_PRESETS.includes(raw)) return { select: raw, other: '' };
  if (raw === OTHER_VALUE) return { select: OTHER_VALUE, other: '' };

  return { select: OTHER_VALUE, other: raw };
}

export function buildIndustryToSave(select, otherTrimmed) {
  if (!select) return '';
  if (select === OTHER_VALUE) {
    return otherTrimmed ? `Other: ${otherTrimmed}` : '';
  }
  return select;
}
