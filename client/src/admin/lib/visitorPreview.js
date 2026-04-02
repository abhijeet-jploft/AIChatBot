export function buildVisitorPreviewUrl(company, sessionId = '') {
  const safeSessionId = String(sessionId || '').trim();
  const embedBase = String(company?.embedUrl || company?.embedPath || '').trim();

  if (embedBase) {
    if (!safeSessionId) return embedBase;
    const separator = embedBase.includes('?') ? '&' : '?';
    return `${embedBase}${separator}sessionId=${encodeURIComponent(safeSessionId)}`;
  }

  const params = new URLSearchParams();
  if (safeSessionId) params.set('sessionId', safeSessionId);
  if (company?.companyId) params.set('companyId', String(company.companyId));
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}
