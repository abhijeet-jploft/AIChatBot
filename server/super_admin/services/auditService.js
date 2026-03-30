const pool = require('../../db/index');
const { normalizeCalendarRangeQuery } = require('../../utils/dateRangeQuery');

function resolveActor(actorOrReq) {
  const actor = actorOrReq?.authUser || actorOrReq || {};
  const type = String(actor.type || 'system').trim().toLowerCase() || 'system';
  return {
    actorType: type,
    actorId: actor.id || null,
    actorLabel: actor.username || actor.name || actor.email || 'system',
  };
}

async function appendAuditLog(actorOrReq, entry) {
  const actor = resolveActor(actorOrReq);
  await pool.query(
    `INSERT INTO super_admin_audit_logs (
       actor_type,
       actor_id,
       actor_label,
       action,
       target_type,
       target_id,
       target_label,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor.actorType,
      actor.actorId,
      actor.actorLabel,
      String(entry?.action || '').trim(),
      entry?.targetType ? String(entry.targetType).trim() : null,
      entry?.targetId ? String(entry.targetId).trim() : null,
      entry?.targetLabel ? String(entry.targetLabel).trim() : null,
      entry?.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
}

function ilikeContainsPattern(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return `%${s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

/**
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @param {string} [opts.search] — matches actor_label, action, target_label, target_type, target_id
 * @param {string} [opts.actorType] — super_admin | staff | system
 * @param {string} [opts.action] — substring match on action
 * @param {string} [opts.targetType] — substring match on target_type
 * @param {string} [opts.dateFrom] — ISO date/datetime, inclusive
 * @param {string} [opts.dateTo] — inclusive end calendar day
 */
async function listAuditLogs(opts = {}) {
  const range = normalizeCalendarRangeQuery(opts.dateFrom, opts.dateTo);
  const dateFromOpt = range.from;
  const dateToOpt = range.to;

  const safeLimit = Math.max(1, Math.min(500, Number(opts.limit) || 50));
  const safeOffset = Math.max(0, Number(opts.offset) || 0);

  const parts = [];
  const params = [];
  let i = 1;

  const searchPat = ilikeContainsPattern(opts.search);
  if (searchPat) {
    parts.push(
      `(actor_label ILIKE $${i} ESCAPE '\\' OR action ILIKE $${i} ESCAPE '\\' OR COALESCE(target_label, '') ILIKE $${i} ESCAPE '\\' OR COALESCE(target_type, '') ILIKE $${i} ESCAPE '\\' OR COALESCE(target_id::text, '') ILIKE $${i} ESCAPE '\\')`
    );
    params.push(searchPat);
    i += 1;
  }

  const actorType = String(opts.actorType || '').trim().toLowerCase();
  if (actorType && ['super_admin', 'staff', 'system'].includes(actorType)) {
    parts.push(`actor_type = $${i}`);
    params.push(actorType);
    i += 1;
  }

  const actionPat = ilikeContainsPattern(opts.action);
  if (actionPat) {
    parts.push(`action ILIKE $${i} ESCAPE '\\'`);
    params.push(actionPat);
    i += 1;
  }

  const targetTypePat = ilikeContainsPattern(opts.targetType);
  if (targetTypePat) {
    parts.push(`COALESCE(target_type, '') ILIKE $${i} ESCAPE '\\'`);
    params.push(targetTypePat);
    i += 1;
  }

  if (dateFromOpt) {
    const d = new Date(dateFromOpt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`created_at >= $${i}::timestamptz`);
      params.push(d.toISOString());
      i += 1;
    }
  }

  if (dateToOpt) {
    const d = new Date(dateToOpt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`created_at < ($${i}::date + INTERVAL '1 day')::timestamptz`);
      params.push(d.toISOString().slice(0, 10));
      i += 1;
    }
  }

  const whereSql = parts.length ? parts.join(' AND ') : 'TRUE';

  const countQ = await pool.query(
    `SELECT COUNT(*)::int AS n FROM super_admin_audit_logs WHERE ${whereSql}`,
    params
  );
  const total = Number(countQ.rows[0]?.n || 0);

  const limIdx = i;
  const offIdx = i + 1;
  const dataParams = [...params, safeLimit, safeOffset];

  const { rows } = await pool.query(
    `SELECT
       id,
       actor_type,
       actor_id,
       actor_label,
       action,
       target_type,
       target_id,
       target_label,
       metadata,
       created_at
     FROM super_admin_audit_logs
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    dataParams
  );

  return {
    rows,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

module.exports = {
  appendAuditLog,
  listAuditLogs,
};