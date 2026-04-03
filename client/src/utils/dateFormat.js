/**
 * Centralized date/time formatting — India Standard Time (IST, UTC+5:30).
 * Every display-facing formatter uses timeZone: 'Asia/Kolkata'.
 */

const TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';

/** General date+time: "18/6/2025, 3:42:15 pm" */
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, { timeZone: TZ });
}

/** Date only: "18/6/2025" */
export function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, { timeZone: TZ });
}

/** Time only: "3:42 pm" */
export function formatTimeOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

/** Detailed: "18 Jun 2025, 03:42:15 pm" */
export function formatDateTimeFull(value) {
  if (!value) return String(value || '');
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || '');
  return dt.toLocaleString(LOCALE, {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Relative time: "Just now", "5m ago", "3h ago", "2d ago", or fallback to date string. */
export function formatTimeAgo(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString(LOCALE, { timeZone: TZ });
}

/** Wrapper: accepts a raw timestamp (epoch ms or ISO string). */
export function formatTimeAgoTs(ts) {
  if (!ts) return '—';
  return formatTimeAgo(new Date(ts).toISOString());
}

/** Chat bubble timestamp — time if same day, otherwise date + time. */
export function formatMessageDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';

  const nowParts = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const msgParts = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dt);
  const get = (parts, type) => parts.find((p) => p.type === type)?.value;
  const sameDay = get(nowParts, 'year') === get(msgParts, 'year')
    && get(nowParts, 'month') === get(msgParts, 'month')
    && get(nowParts, 'day') === get(msgParts, 'day');

  const timePart = dt.toLocaleTimeString(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  if (sameDay) return timePart;
  const datePart = dt.toLocaleDateString(LOCALE, { timeZone: TZ });
  return `${datePart} ${timePart}`;
}

/** For <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) in IST. */
export function formatDateTimeInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d).forEach(({ type, value: v }) => { parts[type] = v; });
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Short date for chart axis labels. Pass extra Intl options like { month: 'short', day: 'numeric' }. */
export function formatDateShort(value, opts = { month: 'short', day: 'numeric' }) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, { timeZone: TZ, ...opts });
}
