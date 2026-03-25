const pool = require('../../db/index');

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

async function listAuditLogs(limit = 100, offset = 0) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
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
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  return rows;
}

module.exports = {
  appendAuditLog,
  listAuditLogs,
};