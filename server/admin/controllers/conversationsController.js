const pool = require('../../db/index');
const { normalizeCalendarRangeQuery } = require('../../utils/dateRangeQuery');
const ChatMessage = require('../../models/ChatMessage');
const ChatSession = require('../../models/ChatSession');
const Lead = require('../../models/Lead');
const { pushMessageToSession, recordMessage: recordLiveMessage } = require('../../services/activeVisitorsService');
const { deriveLeadFromConversation, normalizePhone } = require('../../services/leadCaptureService');
const {
  buildConversationSummary,
  pickVisitorDisplayName,
  sanitizeLocation,
} = require('../../services/conversationInsights');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function humanizeToken(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  return /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(email) ? email : '';
}

function inferIntentFromMessages(messages = []) {
  const userText = messages
    .filter((m) => String(m.role || '').toLowerCase() === 'user')
    .map((m) => String(m.content || ''))
    .join(' ')
    .toLowerCase();

  if (!userText) return 'general_inquiry';
  if (/\b(price|pricing|quote|budget|cost)\b/.test(userText)) return 'pricing_request';
  if (/\b(support|issue|problem|bug|error|help)\b/.test(userText)) return 'support_request';
  if (/\b(app|mobile app|ios|android)\b/.test(userText)) return 'app';
  if (/\b(website|web site|landing page|portal)\b/.test(userText)) return 'website';
  if (/\b(call|meeting|consult|schedule)\b/.test(userText)) return 'consultation_request';
  return 'general_inquiry';
}

function inferConversationStatus({ updatedAt, leadStatus, activeCutoffMs }) {
  const normalizedLeadStatus = String(leadStatus || '').toLowerCase();
  if (normalizedLeadStatus === 'converted') return 'converted_to_lead';
  if (['follow_up_required', 'in_discussion', 'proposal_sent'].includes(normalizedLeadStatus)) return 'escalated';

  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
  return updatedMs >= activeCutoffMs ? 'active' : 'closed';
}

/**
 * GET /admin/conversations
 * Query: search, limit, page, dateFrom, dateTo, leadStatus, status, intent, outcome
 * Returns: { rows, total, limit, page } - conversations with message_count, first_message, leadId.
 * 4.3.3: Filter by date range, lead status, active/closed, search by visitor name/email/phone or first message/title.
 */
async function listConversations(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query.limit) || DEFAULT_LIMIT));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const { from: dateFrom, to: dateTo } = normalizeCalendarRangeQuery(
      req.query.dateFrom,
      req.query.dateTo
    );
    const leadStatus = (req.query.leadStatus || 'all').toLowerCase();
    const statusFilter = (req.query.status || 'all').toLowerCase();
    const intentFilter = humanizeToken(req.query.intent).toLowerCase().replace(/\s+/g, '_');
    const outcomeFilter = humanizeToken(req.query.outcome).toLowerCase().replace(/\s+/g, '_');
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const countWhere = ['cs.company_id = $1'];
    const listWhere = ['cs.company_id = $1'];
    const countValues = [companyId];
    const listValues = [companyId];
    let paramIndex = 2;

    if (dateFrom) {
      countWhere.push(`(cs.updated_at >= $${paramIndex}::timestamptz)`);
      listWhere.push(`(cs.updated_at >= $${paramIndex}::timestamptz)`);
      countValues.push(dateFrom);
      listValues.push(dateFrom);
      paramIndex += 1;
    }
    if (dateTo) {
      countWhere.push(`(cs.updated_at <= $${paramIndex}::timestamptz)`);
      listWhere.push(`(cs.updated_at <= $${paramIndex}::timestamptz)`);
      countValues.push(dateTo);
      listValues.push(dateTo);
      paramIndex += 1;
    }

    if (leadStatus === 'yes') {
      countWhere.push(`EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
      listWhere.push(`EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
    } else if (leadStatus === 'no') {
      countWhere.push(`NOT EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
      listWhere.push(`NOT EXISTS (SELECT 1 FROM leads l WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL)`);
    }

    if (statusFilter === 'active') {
      countWhere.push(`cs.updated_at >= $${paramIndex}`);
      listWhere.push(`cs.updated_at >= $${paramIndex}`);
      countValues.push(thirtyMinutesAgo);
      listValues.push(thirtyMinutesAgo);
      paramIndex += 1;
    } else if (statusFilter === 'closed') {
      countWhere.push(`cs.updated_at < $${paramIndex}`);
      listWhere.push(`cs.updated_at < $${paramIndex}`);
      countValues.push(thirtyMinutesAgo);
      listValues.push(thirtyMinutesAgo);
      paramIndex += 1;
    }

    if (intentFilter && intentFilter !== 'all') {
      countWhere.push(`EXISTS (
        SELECT 1 FROM leads l
        WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND COALESCE(l.ai_detected_intent, '') = $${paramIndex}
      )`);
      listWhere.push(`EXISTS (
        SELECT 1 FROM leads l
        WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND COALESCE(l.ai_detected_intent, '') = $${paramIndex}
      )`);
      countValues.push(intentFilter);
      listValues.push(intentFilter);
      paramIndex += 1;
    }

    if (outcomeFilter && outcomeFilter !== 'all') {
      if (outcomeFilter === 'converted') {
        countWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
            AND l.status = 'converted'
        )`);
        listWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
            AND l.status = 'converted'
        )`);
      } else if (outcomeFilter === 'escalated') {
        countWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
            AND l.status IN ('follow_up_required', 'in_discussion', 'proposal_sent')
        )`);
        listWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
            AND l.status IN ('follow_up_required', 'in_discussion', 'proposal_sent')
        )`);
      } else if (outcomeFilter === 'lead_captured') {
        countWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        )`);
        listWhere.push(`EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        )`);
      } else if (outcomeFilter === 'no_lead') {
        countWhere.push(`NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        )`);
        listWhere.push(`NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        )`);
      }
    }

    if (search) {
      const searchPattern = `%${search}%`;
      countValues.push(searchPattern);
      listValues.push(searchPattern);
      const iCount = paramIndex;
      const iList = paramIndex;
      paramIndex += 1;
      countWhere.push(`(
        cs.title ILIKE $${iCount}
        OR EXISTS (
          SELECT 1 FROM chat_messages m
          WHERE m.session_id = cs.id AND m.role = 'user' AND m.content ILIKE $${iCount}
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND (COALESCE(l.name,'') ILIKE $${iCount} OR COALESCE(l.phone,'') ILIKE $${iCount} OR COALESCE(l.email,'') ILIKE $${iCount})
          LIMIT 1
        )
      )`);
      listWhere.push(`(
        cs.title ILIKE $${iList}
        OR EXISTS (
          SELECT 1 FROM chat_messages m
          WHERE m.session_id = cs.id AND m.role = 'user' AND m.content ILIKE $${iList}
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1 FROM leads l
          WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
          AND (COALESCE(l.name,'') ILIKE $${iList} OR COALESCE(l.phone,'') ILIKE $${iList} OR COALESCE(l.email,'') ILIKE $${iList})
          LIMIT 1
        )
      )`);
    }

    const countSql = `SELECT COUNT(*)::int AS total
      FROM chat_sessions cs
      WHERE ${countWhere.join(' AND ')}`;
    const countResult = await pool.query(countSql, countValues);
    const total = countResult.rows[0]?.total ?? 0;

    const listValuesWithPage = [...listValues, limit, offset];
    const listSql = `
      SELECT
        cs.id,
        cs.title,
        cs.created_at,
        cs.updated_at,
        msg.message_count,
        msg.first_message,
        msg.first_message_at,
        msg.last_message_at,
        lead.id AS lead_id,
        lead.name AS lead_name,
        lead.email AS lead_email,
        lead.phone AS lead_phone,
        lead.landing_page,
        lead.ai_detected_intent,
        lead.status AS lead_status,
        lead.project_summary,
        lead.lead_score,
        lead.lead_score_category
      FROM chat_sessions cs
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS message_count,
          MIN(m.created_at) AS first_message_at,
          MAX(m.created_at) AS last_message_at,
          (
            SELECT m2.content
            FROM chat_messages m2
            WHERE m2.session_id = cs.id AND m2.role = 'user'
            ORDER BY m2.created_at ASC
            LIMIT 1
          ) AS first_message
        FROM chat_messages m
        WHERE m.session_id = cs.id
      ) msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          l.id,
          l.name,
          l.email,
          l.phone,
          l.landing_page,
          l.ai_detected_intent,
          l.status,
          l.project_summary,
          l.lead_score,
          l.lead_score_category
        FROM leads l
        WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC
        LIMIT 1
      ) lead ON TRUE
      WHERE ${listWhere.join(' AND ')}
      ORDER BY cs.updated_at DESC
      LIMIT $${listValues.length + 1}
      OFFSET $${listValues.length + 2}
    `;
    const { rows } = await pool.query(listSql, listValuesWithPage);

    const activeCutoffMs = new Date(thirtyMinutesAgo).getTime();
    const conversations = rows.map((r) => {
      const firstAt = r.first_message_at || r.created_at;
      const lastAt = r.last_message_at || r.updated_at || r.created_at;
      const durationSeconds = Math.max(
        0,
        Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 1000)
      );
      const intentTag = r.ai_detected_intent || 'general_inquiry';
      const summarySeed = String(r.project_summary || r.first_message || '').trim();

      return {
        id: r.id,
        title: r.title || 'New Chat',
        firstMessage: (r.first_message || '').toString().slice(0, 200),
        messageCount: r.message_count ?? 0,
        leadId: r.lead_id || null,
        leadCaptured: Boolean(r.lead_id),
        visitorId: r.id,
        visitorName: pickVisitorDisplayName(r.lead_name, r.lead_email, r.lead_phone),
        sourcePage: r.landing_page || null,
        intentTag,
        summary: summarySeed ? summarySeed.slice(0, 240) : `Intent: ${humanizeToken(intentTag) || 'General inquiry'}`,
        outcome: r.lead_id ? (r.lead_status || 'lead_captured') : 'no_lead',
        status: inferConversationStatus({
          updatedAt: r.updated_at,
          leadStatus: r.lead_status,
          activeCutoffMs,
        }),
        durationSeconds,
        durationLabel: `${Math.max(0, Math.round(durationSeconds / 60))}m`,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    res.json({
      rows: conversations,
      total,
      limit,
      offset,
      page,
    });
  } catch (err) {
    console.error('[admin conversations] list:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/conversations/:sessionId
 * Returns a full conversation detail payload with transcript metadata,
 * lead information, inferred intent and an auto-generated summary.
 */
async function getConversationDetail(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const sessionResult = await pool.query(
      `SELECT
        cs.id,
        cs.title,
        cs.created_at,
        cs.updated_at,
        lead.id AS lead_id,
        lead.name AS lead_name,
        lead.phone AS lead_phone,
        lead.email AS lead_email,
        lead.location AS lead_location,
        lead.business_type,
        lead.service_requested,
        lead.project_summary,
        lead.budget_range,
        lead.timeline,
        lead.status AS lead_status,
        lead.lead_score,
        lead.lead_score_category,
        lead.ai_detected_intent,
        lead.landing_page,
        lead.device_type,
        lead.contact_method,
        lead.assigned_owner
      FROM chat_sessions cs
      LEFT JOIN LATERAL (
        SELECT
          l.id,
          l.name,
          l.phone,
          l.email,
          l.location,
          l.business_type,
          l.service_requested,
          l.project_summary,
          l.budget_range,
          l.timeline,
          l.status,
          l.lead_score,
          l.lead_score_category,
          l.ai_detected_intent,
          l.landing_page,
          l.device_type,
          l.contact_method,
          l.assigned_owner
        FROM leads l
        WHERE l.session_id = cs.id AND l.company_id = cs.company_id AND l.deleted_at IS NULL
        ORDER BY l.created_at DESC
        LIMIT 1
      ) lead ON TRUE
      WHERE cs.id = $1 AND cs.company_id = $2
      LIMIT 1`,
      [sessionId, companyId]
    );

    const sessionRow = sessionResult.rows[0];
    if (!sessionRow) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messageResult = await pool.query(
      `SELECT role, content, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    const transcript = messageResult.rows || [];

    const firstAt = transcript[0]?.created_at || sessionRow.created_at;
    const lastAt = transcript[transcript.length - 1]?.created_at || sessionRow.updated_at || sessionRow.created_at;
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 1000)
    );
    const intentTag = sessionRow.ai_detected_intent || inferIntentFromMessages(transcript);
    const summary = buildConversationSummary({
      lead: sessionRow,
      messages: transcript,
      intentTag,
      messageCount: transcript.length,
      durationSeconds,
    });

    const messages = transcript.map((row) => ({
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      messageType: 'text',
    }));

    res.json({
      session: {
        id: sessionRow.id,
        title: sessionRow.title || 'Conversation',
        visitorId: sessionRow.id,
        visitorName: pickVisitorDisplayName(sessionRow.lead_name, sessionRow.lead_email, sessionRow.lead_phone),
        sourcePage: sessionRow.landing_page || null,
        status: inferConversationStatus({
          updatedAt: sessionRow.updated_at,
          leadStatus: sessionRow.lead_status,
          activeCutoffMs: Date.now() - 30 * 60 * 1000,
        }),
        intentTag,
        createdAt: sessionRow.created_at,
        updatedAt: sessionRow.updated_at,
        durationSeconds,
        durationLabel: `${Math.max(0, Math.round(durationSeconds / 60))}m`,
      },
      lead: sessionRow.lead_id
        ? {
            id: sessionRow.lead_id,
            name: pickVisitorDisplayName(sessionRow.lead_name, sessionRow.lead_email, sessionRow.lead_phone),
            phone: sessionRow.lead_phone,
            email: sessionRow.lead_email,
            location: sanitizeLocation(sessionRow.lead_location),
            businessType: sessionRow.business_type,
            serviceRequested: sessionRow.service_requested,
            projectSummary: sessionRow.project_summary,
            budgetRange: sessionRow.budget_range,
            timeline: sessionRow.timeline,
            status: sessionRow.lead_status,
            leadScore: sessionRow.lead_score,
            leadScoreCategory: sessionRow.lead_score_category,
            intentTag,
            landingPage: sessionRow.landing_page,
            deviceType: sessionRow.device_type,
            contactMethod: sessionRow.contact_method,
            assignedOwner: sessionRow.assigned_owner,
          }
        : null,
      summary,
      messages,
    });
  } catch (err) {
    console.error('[admin conversations] detail:', err);
    res.status(500).json({ error: err.message });
  }
}

async function convertConversationToLead(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const sessionRow = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND company_id = $2',
      [sessionId, companyId]
    );
    if (!sessionRow.rows?.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await ChatMessage.listBySession(sessionId);
    const inferred = deriveLeadFromConversation({ messages, requestMeta: {} });
    const name = pickVisitorDisplayName(req.body?.name, inferred.name, req.body?.email, req.body?.phone);
    const phone = normalizePhone(req.body?.phone || inferred.phone || '');
    const email = normalizeEmail(req.body?.email || inferred.email || '');
    const location = sanitizeLocation(req.body?.location || inferred.location || '');

    if (!phone && !email) {
      return res.status(400).json({ error: 'Phone or email is required to convert this conversation into a lead' });
    }

    const existing = await Lead.findByCompanyAndSession(companyId, sessionId);
    const leadScore = Math.max(
      Number(inferred.leadScore || 0),
      phone ? 30 : 0,
      email ? 22 : 0,
      name ? 8 : 0
    );

    const { lead, inserted, previousStatus } = await Lead.upsertCapturedLead({
      companyId,
      sessionId,
      name,
      phone,
      email,
      location,
      businessType: inferred.businessType,
      serviceRequested: inferred.serviceRequested,
      projectSummary: inferred.projectSummary,
      budgetRange: inferred.budgetRange,
      timeline: inferred.timeline,
      landingPage: inferred.landingPage,
      deviceType: inferred.deviceType,
      aiDetectedIntent: inferred.aiDetectedIntent,
      leadScore,
      contactMethod: phone && email ? 'whatsapp/email/call' : phone ? 'whatsapp/call' : 'email',
    });

    if (lead?.id && !existing && inserted) {
      await Lead.addStatusHistory(lead.id, previousStatus, lead.status || 'new');
    }
    if (lead?.id) {
      await Lead.addActivity(
        lead.id,
        'manual_conversion',
        'Lead created or updated manually from admin conversations.',
        { sessionId, inserted: Boolean(inserted) }
      );
    }

    return res.json({ ok: true, inserted: Boolean(inserted), lead });
  } catch (err) {
    console.error('[admin conversations] convert lead:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /admin/conversations/:sessionId/messages
 * Same shape as public GET /api/sessions/:id/messages — { role, content }[], oldest first.
 */
async function getMessages(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const sessionRow = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND company_id = $2',
      [sessionId, companyId]
    );
    if (!sessionRow.rows?.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const rows = await ChatMessage.listBySession(sessionId);
    res.json(rows.map((r) => ({ role: r.role, content: r.content })));
  } catch (err) {
    console.error('[admin conversations] messages:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/conversations/:sessionId/send
 * Body: { content }
 * Saves message as assistant, pushes to visitor WebSocket if connected (take-over).
 */
async function sendMessage(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const sessionId = req.params.sessionId;
    const content = req.body?.content != null ? String(req.body.content) : '';

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const sessionRow = await pool.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND company_id = $2',
      [sessionId, companyId]
    );
    if (!sessionRow.rows?.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await ChatMessage.create(sessionId, 'assistant', content);
    await ChatSession.touch(sessionId);
    recordLiveMessage(companyId, sessionId, 'assistant', content);

    const pushed = pushMessageToSession(companyId, sessionId, content);

    res.json({ sent: true, pushedToLive: pushed });
  } catch (err) {
    console.error('[admin conversations] send:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { listConversations, getConversationDetail, getMessages, sendMessage, convertConversationToLead };
