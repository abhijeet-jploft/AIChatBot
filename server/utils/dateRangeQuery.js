const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} raw
 * @returns {string|null} YYYY-MM-DD or null if not a plain calendar day string
 */
function calendarDayOrNull(raw) {
  const t = String(raw || '').trim();
  return ISO_DATE.test(t) ? t : null;
}

/**
 * When both bounds are YYYY-MM-DD and to < from, raise to to match from.
 * Otherwise returns trimmed originals (preserves non-calendar query strings).
 * @returns {{ from: string, to: string }}
 */
function normalizeCalendarRangeQuery(fromRaw, toRaw) {
  const fromOrig = String(fromRaw || '').trim();
  const toOrig = String(toRaw || '').trim();
  const fromDay = calendarDayOrNull(fromOrig);
  const toDay = calendarDayOrNull(toOrig);
  if (fromDay && toDay && toDay < fromDay) {
    return { from: fromDay, to: fromDay };
  }
  return { from: fromOrig, to: toOrig };
}

module.exports = {
  normalizeCalendarRangeQuery,
  calendarDayOrNull,
  ISO_DATE,
};
