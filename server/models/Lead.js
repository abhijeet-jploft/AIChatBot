const pool = require('../db/index');

const LEAD_STATUSES = Object.freeze([
  'new',
  'contacted',
  'in_discussion',
  'proposal_sent',
  'converted',
  'lost',
  'follow_up_required',
]);

const SCORE_CATEGORIES = Object.freeze(['cold', 'warm', 'hot', 'very_hot']);

function clampScore(score) {
  const n = Number.isFinite(Number(score)) ? Number(score) : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreCategoryFromScore(score) {
  const n = clampScore(score);
  if (n >= 75) return 'very_hot';
  if (n >= 50) return 'hot';
  if (n >= 25) return 'warm';
  return 'cold';
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  return LEAD_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeScoreCategory(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return SCORE_CATEGORIES.includes(normalized) ? normalized : null;
}

function maskPhone(phone) {
  const value = String(phone || '').trim();
  if (!value) return null;

  const suffix = value.slice(-4);
  return `xxxxxx${suffix}`;
}

function maskEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value || !value.includes('@')) return null;

  const [local, domain] = value.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function normalizeReminderAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildWhereClause(companyId, filters = {}) {
  const where = ['company_id = $1', 'deleted_at IS NULL'];
  const values = [companyId];

  if (filters.status && filters.status !== 'all') {
    const status = normalizeStatus(filters.status);
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }
  }

  if (filters.scoreCategory && filters.scoreCategory !== 'all') {
    const scoreCategory = normalizeScoreCategory(filters.scoreCategory);
    if (scoreCategory) {
      values.push(scoreCategory);
      where.push(`lead_score_category = $${values.length}`);
    }
  }

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    const i = values.length;
    where.push(`(
      COALESCE(name, '') ILIKE $${i}
      OR COALESCE(phone, '') ILIKE $${i}
      OR COALESCE(email, '') ILIKE $${i}
      OR COALESCE(project_summary, '') ILIKE $${i}
    )`);
  }

  if (filters.fromDate) {
    values.push(filters.fromDate);
    where.push(`created_at >= $${values.length}::date`);
  }

  if (filters.toDate) {
    values.push(filters.toDate);
    where.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  if (filters.ids && Array.isArray(filters.ids) && filters.ids.length) {
    values.push(filters.ids);
    where.push(`id = ANY($${values.length}::uuid[])`);
  }

  if (filters.reminderState && filters.reminderState !== 'all') {
    const reminderState = String(filters.reminderState).trim().toLowerCase();
    if (reminderState === 'due_today') {
      where.push(`reminder_at IS NOT NULL AND reminder_at::date = CURRENT_DATE AND status NOT IN ('converted', 'lost')`);
    } else if (reminderState === 'overdue') {
      where.push(`reminder_at IS NOT NULL AND reminder_at < NOW() AND status NOT IN ('converted', 'lost')`);
    } else if (reminderState === 'none') {
      where.push('reminder_at IS NULL');
    }
  }

  return { whereSql: where.join(' AND '), values };
}

async function findByCompanyAndSession(companyId, sessionId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM leads
     WHERE company_id = $1 AND session_id = $2 AND deleted_at IS NULL`,
    [companyId, sessionId]
  );
  return rows[0] || null;
}

async function addStatusHistory(leadId, fromStatus, toStatus) {
  await pool.query(
    `INSERT INTO lead_status_history (lead_id, from_status, to_status)
     VALUES ($1, $2, $3)`,
    [leadId, fromStatus || null, toStatus]
  );
}

async function addActivity(leadId, activityType, details, metadata = null) {
  await pool.query(
    `INSERT INTO lead_activities (lead_id, activity_type, details, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [leadId, activityType, details || null, metadata ? JSON.stringify(metadata) : null]
  );
}

async function upsertCapturedLead({
  companyId,
  sessionId,
  name,
  phone,
  email,
  location,
  businessType,
  serviceRequested,
  projectSummary,
  budgetRange,
  timeline,
  landingPage,
  deviceType,
  aiDetectedIntent,
  leadScore = 0,
  contactMethod,
}) {
  const existing = await findByCompanyAndSession(companyId, sessionId);
  const score = clampScore(leadScore);

  const { rows } = await pool.query(
    `INSERT INTO leads (
      company_id,
      session_id,
      name,
      phone,
      email,
      location,
      business_type,
      service_requested,
      project_summary,
      budget_range,
      timeline,
      landing_page,
      device_type,
      ai_detected_intent,
      status,
      lead_score,
      lead_score_category,
      contact_method
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'new',$15,$16,$17
    )
    ON CONFLICT (company_id, session_id)
    DO UPDATE SET
      name = COALESCE(NULLIF(EXCLUDED.name, ''), leads.name),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), leads.phone),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), leads.email),
      location = COALESCE(NULLIF(EXCLUDED.location, ''), leads.location),
      business_type = COALESCE(NULLIF(EXCLUDED.business_type, ''), leads.business_type),
      service_requested = COALESCE(NULLIF(EXCLUDED.service_requested, ''), leads.service_requested),
      project_summary = COALESCE(NULLIF(EXCLUDED.project_summary, ''), leads.project_summary),
      budget_range = COALESCE(NULLIF(EXCLUDED.budget_range, ''), leads.budget_range),
      timeline = COALESCE(NULLIF(EXCLUDED.timeline, ''), leads.timeline),
      landing_page = COALESCE(NULLIF(EXCLUDED.landing_page, ''), leads.landing_page),
      device_type = COALESCE(NULLIF(EXCLUDED.device_type, ''), leads.device_type),
      ai_detected_intent = COALESCE(NULLIF(EXCLUDED.ai_detected_intent, ''), leads.ai_detected_intent),
      lead_score = GREATEST(leads.lead_score, EXCLUDED.lead_score),
      lead_score_category = CASE
        WHEN GREATEST(leads.lead_score, EXCLUDED.lead_score) >= 75 THEN 'very_hot'
        WHEN GREATEST(leads.lead_score, EXCLUDED.lead_score) >= 50 THEN 'hot'
        WHEN GREATEST(leads.lead_score, EXCLUDED.lead_score) >= 25 THEN 'warm'
        ELSE 'cold'
      END,
      contact_method = COALESCE(NULLIF(EXCLUDED.contact_method, ''), leads.contact_method),
      updated_at = NOW()
    RETURNING *`,
    [
      companyId,
      sessionId,
      name || null,
      phone || null,
      email || null,
      location || null,
      businessType || null,
      serviceRequested || null,
      projectSummary || null,
      budgetRange || null,
      timeline || null,
      landingPage || null,
      deviceType || null,
      aiDetectedIntent || null,
      score,
      scoreCategoryFromScore(score),
      contactMethod || null,
    ]
  );

  return {
    lead: rows[0] || null,
    inserted: !existing,
    previousStatus: existing?.status || null,
  };
}

async function listByCompany(companyId, filters = {}) {
  const sort = String(filters.sort || 'newest').toLowerCase();
  const orderBy = sort === 'highest_score'
    ? 'lead_score DESC, created_at DESC'
    : 'created_at DESC';
  const limit = Math.max(1, Math.min(500, Number.parseInt(filters.limit || '100', 10) || 100));
  const offset = Math.max(0, Number.parseInt(filters.offset || '0', 10) || 0);

  const { whereSql, values } = buildWhereClause(companyId, filters);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM leads
     WHERE ${whereSql}`,
    values
  );

  const pagedValues = [...values, limit, offset];
  const { rows } = await pool.query(
    `SELECT
      id,
      session_id,
      name,
      phone,
      email,
      service_requested,
      project_summary,
      status,
      lead_score,
      lead_score_category,
      contact_method,
      ai_detected_intent,
      timeline,
      budget_range,
      assigned_owner,
      reminder_at,
      reminder_note,
      (reminder_at IS NOT NULL AND reminder_at::date = CURRENT_DATE AND status NOT IN ('converted', 'lost')) AS reminder_due_today,
      (reminder_at IS NOT NULL AND reminder_at < NOW() AND status NOT IN ('converted', 'lost')) AS reminder_overdue,
      created_at,
      updated_at
     FROM leads
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    pagedValues
  );

  const maskedRows = rows.map((row) => ({
    ...row,
    phone: maskPhone(row.phone),
    email: maskEmail(row.email),
  }));

  return {
    rows: maskedRows,
    total: countResult.rows[0]?.total || 0,
  };
}

async function findById(companyId, leadId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM leads
     WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [companyId, leadId]
  );
  return rows[0] || null;
}

async function listTranscriptByLead(companyId, leadId) {
  const { rows } = await pool.query(
    `SELECT m.role, m.content, m.created_at
     FROM leads l
     JOIN chat_messages m ON m.session_id = l.session_id
     WHERE l.company_id = $1 AND l.id = $2 AND l.deleted_at IS NULL
     ORDER BY m.created_at ASC`,
    [companyId, leadId]
  );

  return rows;
}

async function listStatusHistory(leadId) {
  const { rows } = await pool.query(
    `SELECT from_status, to_status, changed_at
     FROM lead_status_history
     WHERE lead_id = $1
     ORDER BY changed_at DESC`,
    [leadId]
  );
  return rows;
}

async function listActivities(leadId, limit = 100) {
  const capped = Math.max(1, Math.min(300, Number(limit) || 100));
  const { rows } = await pool.query(
    `SELECT activity_type, details, metadata, created_at
     FROM lead_activities
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leadId, capped]
  );
  return rows;
}

async function updateStatus(companyId, leadId, status) {
  const nextStatus = normalizeStatus(status);
  if (!nextStatus) {
    const err = new Error('Invalid lead status');
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT id, status
       FROM leads
       WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [companyId, leadId]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      const err = new Error('Lead not found');
      err.statusCode = 404;
      throw err;
    }

    if (existing.status !== nextStatus) {
      await client.query(
        `UPDATE leads
         SET status = $1,
             updated_at = NOW(),
             converted_at = CASE WHEN $1 = 'converted' THEN COALESCE(converted_at, NOW()) ELSE converted_at END
         WHERE id = $2`,
        [nextStatus, leadId]
      );

      await client.query(
        `INSERT INTO lead_status_history (lead_id, from_status, to_status)
         VALUES ($1, $2, $3)`,
        [leadId, existing.status, nextStatus]
      );

      await client.query(
        `INSERT INTO lead_activities (lead_id, activity_type, details, metadata)
         VALUES ($1, 'status_change', $2, $3::jsonb)`,
        [
          leadId,
          `Status changed from ${existing.status} to ${nextStatus}`,
          JSON.stringify({ from: existing.status, to: nextStatus }),
        ]
      );
    }

    const updatedResult = await client.query(
      `SELECT * FROM leads WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [companyId, leadId]
    );

    await client.query('COMMIT');
    return updatedResult.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function addNote(companyId, leadId, note) {
  const text = String(note || '').trim();
  if (!text) {
    const err = new Error('Note is required');
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE leads
     SET notes = CASE
       WHEN notes IS NULL OR notes = '' THEN $1
       ELSE notes || E'\n' || $1
     END,
     updated_at = NOW()
     WHERE company_id = $2 AND id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [text, companyId, leadId]
  );

  if (!rows[0]) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  await addActivity(leadId, 'note', text, null);
  return rows[0];
}

async function updateOwner(companyId, leadId, owner) {
  const normalizedOwner = owner === null || owner === undefined
    ? null
    : String(owner).trim().slice(0, 255) || null;

  const { rows } = await pool.query(
    `UPDATE leads
     SET assigned_owner = $1,
         updated_at = NOW()
     WHERE company_id = $2 AND id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [normalizedOwner, companyId, leadId]
  );

  if (!rows[0]) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  await addActivity(
    leadId,
    'owner_update',
    normalizedOwner ? `Owner assigned to ${normalizedOwner}` : 'Owner cleared',
    { assignedOwner: normalizedOwner }
  );

  return rows[0];
}

async function updateReminder(companyId, leadId, reminderAt, reminderNote) {
  const normalizedReminderAt = normalizeReminderAt(reminderAt);
  if (reminderAt && !normalizedReminderAt) {
    const err = new Error('Invalid reminder datetime');
    err.statusCode = 400;
    throw err;
  }

  const note = reminderNote === undefined
    ? undefined
    : (String(reminderNote || '').trim() || null);

  const existing = await findById(companyId, leadId);
  if (!existing) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  const nextReminderAt = normalizedReminderAt;
  const nextReminderNote = note === undefined ? existing.reminder_note : note;

  const { rows } = await pool.query(
    `UPDATE leads
     SET reminder_at = $1,
         reminder_note = $2,
         reminder_notified_at = CASE
           WHEN $1 IS NULL THEN NULL
           WHEN reminder_notified_at IS NOT NULL AND $1::timestamptz != reminder_at THEN NULL
           ELSE reminder_notified_at
         END,
         status = CASE
           WHEN $1 IS NOT NULL
             AND status = 'new'
             THEN 'follow_up_required'
           ELSE status
         END,
         updated_at = NOW()
     WHERE company_id = $3 AND id = $4 AND deleted_at IS NULL
     RETURNING *`,
    [nextReminderAt, nextReminderNote, companyId, leadId]
  );

  const updated = rows[0];
  if (!updated) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  if (nextReminderAt) {
    await addActivity(
      leadId,
      'reminder_set',
      `Reminder set for ${new Date(nextReminderAt).toLocaleString()}`,
      {
        reminderAt: nextReminderAt,
        reminderNote: nextReminderNote,
      }
    );
  } else {
    await addActivity(leadId, 'reminder_cleared', 'Reminder cleared', null);
  }

  if (existing.status !== updated.status) {
    await addStatusHistory(leadId, existing.status, updated.status);
  }

  return updated;
}

async function removeById(companyId, leadId) {
  const { rows } = await pool.query(
    `DELETE FROM leads
     WHERE company_id = $1 AND id = $2
     RETURNING id`,
    [companyId, leadId]
  );

  return Boolean(rows[0]);
}

async function listForExport(companyId, filters = {}) {
  const { whereSql, values } = buildWhereClause(companyId, filters);

  const { rows } = await pool.query(
    `SELECT
      id,
      session_id,
      name,
      phone,
      email,
      location,
      business_type,
      service_requested,
      project_summary,
      budget_range,
      timeline,
      landing_page,
      device_type,
      ai_detected_intent,
      status,
      lead_score,
      lead_score_category,
      contact_method,
      assigned_owner,
      reminder_at,
      reminder_note,
      created_at,
      updated_at
     FROM leads
     WHERE ${whereSql}
     ORDER BY created_at DESC`,
    values
  );

  return rows;
}

async function getSummary(companyId) {
  const [summaryResult, latestResult] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
        COUNT(*) FILTER (WHERE lead_score_category IN ('hot', 'very_hot'))::int AS hot_count,
        COUNT(*) FILTER (
          WHERE reminder_at IS NOT NULL
            AND reminder_at::date = CURRENT_DATE
            AND status NOT IN ('converted', 'lost')
        )::int AS reminder_due_today_count,
        COUNT(*) FILTER (
          WHERE reminder_at IS NOT NULL
            AND reminder_at < NOW()
            AND status NOT IN ('converted', 'lost')
        )::int AS reminder_overdue_count,
        MAX(created_at) AS latest_created_at
       FROM leads
       WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId]
    ),
    pool.query(
      `SELECT
        id,
        name,
        service_requested,
        lead_score,
        lead_score_category,
        created_at
       FROM leads
       WHERE company_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [companyId]
    ),
  ]);

  const summary = summaryResult.rows[0] || {
    total: 0,
    new_count: 0,
    hot_count: 0,
    reminder_due_today_count: 0,
    reminder_overdue_count: 0,
    latest_created_at: null,
  };
  const latest = latestResult.rows[0] || null;

  return {
    ...summary,
    latest_new_lead: latest
      ? {
          id: latest.id,
          name: latest.name || null,
          service_requested: latest.service_requested || null,
          urgency_level: latest.lead_score_category === 'very_hot' || latest.lead_score_category === 'hot'
            ? 'high'
            : latest.lead_score_category === 'warm'
              ? 'medium'
              : 'low',
          lead_score: latest.lead_score,
          lead_score_category: latest.lead_score_category,
          created_at: latest.created_at,
        }
      : null,
  };
}

module.exports = {
  LEAD_STATUSES,
  SCORE_CATEGORIES,
  addActivity,
  addNote,
  addStatusHistory,
  findByCompanyAndSession,
  findById,
  getSummary,
  listActivities,
  listByCompany,
  listForExport,
  listStatusHistory,
  listTranscriptByLead,
  normalizeStatus,
  removeById,
  scoreCategoryFromScore,
  upsertCapturedLead,
  updateOwner,
  updateReminder,
  updateStatus,
};
