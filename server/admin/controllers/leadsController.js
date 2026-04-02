const Lead = require('../../models/Lead');
const { normalizeCalendarRangeQuery } = require('../../utils/dateRangeQuery');
const { sendDueReminderDigest } = require('../../services/leadNotificationService');
const {
  buildLeadRequirementSummary,
  extractKeyDiscussionPoints,
  pickVisitorDisplayName,
  sanitizeLocation,
} = require('../../services/conversationInsights');

function toArrayIds(idsParam) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!idsParam) return [];
  if (Array.isArray(idsParam)) {
    return idsParam.map((id) => String(id).trim()).filter((id) => UUID_RE.test(id));
  }
  return String(idsParam)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID_RE.test(id));
}

function parseListFilters(query = {}) {
  const { from: fromDate, to: toDate } = normalizeCalendarRangeQuery(
    query.fromDate,
    query.toDate
  );
  return {
    status: query.status,
    scoreCategory: query.scoreCategory,
    reminderState: query.reminderState,
    search: query.search,
    fromDate,
    toDate,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return text;
  // Preserve phone numbers: wrap leading-+ values so Excel/Sheets don't mangle them.
  if (/^\+?\d[\d\s()-]{4,}$/.test(text)) {
    return `="${text.replace(/"/g, '""')}"`;
  }
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows = []) {
  const headers = [
    'Lead ID',
    'Name',
    'Phone',
    'Email',
    'Location',
    'Business Type',
    'Service Requested',
    'Project Summary',
    'Budget Range',
    'Timeline',
    'Landing Page',
    'Device Type',
    'Conversation ID',
    'AI Intent',
    'Status',
    'Lead Score',
    'Lead Score Category',
    'Contact Method',
    'Assigned Owner',
    'Reminder At',
    'Reminder Note',
    'Created At',
    'Updated At',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.name,
      row.phone,
      row.email,
      row.location,
      row.business_type,
      row.service_requested,
      row.project_summary,
      row.budget_range,
      row.timeline,
      row.landing_page,
      row.device_type,
      row.session_id,
      row.ai_detected_intent,
      row.status,
      row.lead_score,
      row.lead_score_category,
      row.contact_method,
      row.assigned_owner,
      row.reminder_at,
      row.reminder_note,
      row.created_at,
      row.updated_at,
    ].map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function buildTranscriptText(transcript = []) {
  return transcript
    .map((m) => {
      const ts = m.created_at ? new Date(m.created_at).toISOString() : '';
      return `[${ts}] ${String(m.role || '').toUpperCase()}:\n${m.content || ''}\n`;
    })
    .join('\n');
}

async function listLeads(req, res) {
  try {
    const filters = parseListFilters(req.query);
    const result = await Lead.listByCompany(req.adminCompanyId, filters);
    res.json({
      ...result,
      rows: (result.rows || []).map((row) => ({
        ...row,
        requirement_summary: buildLeadRequirementSummary({ lead: row }),
        key_discussion_points: extractKeyDiscussionPoints({ projectSummary: row.project_summary || '' }),
      })),
    });
  } catch (err) {
    console.error('[admin leads] list:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getSummary(req, res) {
  try {
    const summary = await Lead.getSummary(req.adminCompanyId);

    sendDueReminderDigest(req.adminCompanyId).catch((err) => {
      console.error('[admin leads] reminder digest (non-fatal):', err.message);
    });

    res.json(summary);
  } catch (err) {
    console.error('[admin leads] summary:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getLeadDetail(req, res) {
  try {
    const leadId = req.params.leadId;
    const lead = await Lead.findById(req.adminCompanyId, leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const [transcript, statusHistory, activities] = await Promise.all([
      Lead.listTranscriptByLead(req.adminCompanyId, leadId),
      Lead.listStatusHistory(leadId),
      Lead.listActivities(leadId),
    ]);

    res.json({
      lead: {
        ...lead,
        display_name: pickVisitorDisplayName(lead.name, lead.email, lead.phone),
        location: sanitizeLocation(lead.location),
        requirement_summary: buildLeadRequirementSummary({ lead, messages: transcript }),
        key_discussion_points: extractKeyDiscussionPoints({ messages: transcript, projectSummary: lead.project_summary || '' }),
      },
      transcript,
      statusHistory,
      activities,
    });
  } catch (err) {
    console.error('[admin leads] detail:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateLeadStatus(req, res) {
  try {
    const leadId = req.params.leadId;
    const { status } = req.body || {};
    const updated = await Lead.updateStatus(req.adminCompanyId, leadId, status);
    res.json({ lead: updated });
  } catch (err) {
    console.error('[admin leads] status:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function addNote(req, res) {
  try {
    const leadId = req.params.leadId;
    const { note } = req.body || {};
    const updated = await Lead.addNote(req.adminCompanyId, leadId, note);
    res.json({ lead: updated });
  } catch (err) {
    console.error('[admin leads] note:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function addActivity(req, res) {
  try {
    const leadId = req.params.leadId;
    const lead = await Lead.findById(req.adminCompanyId, leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { type, details, metadata } = req.body || {};
    const activityType = String(type || 'manual_activity').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40);
    const text = String(details || '').trim();

    if (!text) {
      return res.status(400).json({ error: 'details is required' });
    }

    await Lead.addActivity(leadId, activityType, text, metadata || null);
    const activities = await Lead.listActivities(leadId);
    res.json({ ok: true, activities });
  } catch (err) {
    console.error('[admin leads] activity:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateLeadOwner(req, res) {
  try {
    const leadId = req.params.leadId;
    const { owner } = req.body || {};
    const updated = await Lead.updateOwner(req.adminCompanyId, leadId, owner);
    res.json({ lead: updated });
  } catch (err) {
    console.error('[admin leads] owner:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function updateLeadReminder(req, res) {
  try {
    const leadId = req.params.leadId;
    const { reminderAt, note } = req.body || {};
    const updated = await Lead.updateReminder(req.adminCompanyId, leadId, reminderAt, note);
    res.json({ lead: updated });
  } catch (err) {
    console.error('[admin leads] reminder:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function exportCsv(req, res) {
  try {
    const filters = parseListFilters(req.query);
    const ids = toArrayIds(req.query.ids);
    const rows = await Lead.listForExport(req.adminCompanyId, {
      ...filters,
      ids: ids.length ? ids : undefined,
    });

    const csv = buildCsv(rows);
    const filename = `leads-${req.adminCompanyId}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[admin leads] export:', err);
    res.status(500).json({ error: err.message });
  }
}

async function downloadTranscript(req, res) {
  try {
    const leadId = req.params.leadId;
    const lead = await Lead.findById(req.adminCompanyId, leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const transcript = await Lead.listTranscriptByLead(req.adminCompanyId, leadId);
    const content = buildTranscriptText(transcript);
    const filename = `lead-${leadId}-transcript.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    console.error('[admin leads] transcript:', err);
    res.status(500).json({ error: err.message });
  }
}

async function removeLead(req, res) {
  try {
    const leadId = req.params.leadId;
    const deleted = await Lead.removeById(req.adminCompanyId, leadId);
    if (!deleted) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('[admin leads] delete:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  addActivity,
  addNote,
  downloadTranscript,
  exportCsv,
  getLeadDetail,
  getSummary,
  listLeads,
  removeLead,
  updateLeadOwner,
  updateLeadReminder,
  updateLeadStatus,
};
