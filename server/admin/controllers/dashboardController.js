const pool = require('../../db/index');
const CompanyAdmin = require('../models/CompanyAdmin');
const Lead = require('../../models/Lead');
const ChatSession = require('../../models/ChatSession');
const { getActiveForCompany } = require('../../services/activeVisitorsService');
const { getActiveJobForCompany } = require('../../services/scraperService');
const { getLastTrainingCompleted } = require('../../services/trainingNotificationStore');

/**
 * GET /admin/dashboard
 * Returns data for 4.1 Admin Dashboard: system status, KPIs, lead snapshot, conversation snapshot, notifications, AI insights.
 */
async function getDashboard(req, res) {
  try {
    const companyId = req.adminCompanyId;

    const [company, leadSummary, kpiResult, recentLeadsResult, recentSessionsResult, leadSessionIdsResult] = await Promise.all([
      CompanyAdmin.findByCompanyId(companyId),
      Lead.getSummary(companyId),
      pool.query(
        `WITH session_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS conversations_today,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE)::int AS conversations_yesterday,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int AS conversations_this_week,
            COUNT(*)::int AS conversations_total
          FROM chat_sessions WHERE company_id = $1
        ),
        lead_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS leads_today,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int AS leads_this_week,
            COUNT(*) FILTER (WHERE ai_detected_intent = 'meeting_booking')::int AS meetings_total
          FROM leads WHERE company_id = $1 AND deleted_at IS NULL
        )
        SELECT
          s.conversations_today,
          s.conversations_yesterday,
          s.conversations_this_week,
          s.conversations_total,
          l.leads_today,
          l.leads_this_week,
          l.meetings_total
        FROM session_stats s, lead_stats l`,
        [companyId]
      ),
      pool.query(
        `SELECT id, session_id, name, project_summary, landing_page, created_at, status
         FROM leads WHERE company_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 8`,
        [companyId]
      ),
      pool.query(
        `SELECT cs.id, cs.title, cs.created_at, cs.updated_at,
                (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id)::int AS message_count,
                (SELECT content FROM chat_messages WHERE session_id = cs.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) AS first_message
         FROM chat_sessions cs
         WHERE cs.company_id = $1
         ORDER BY cs.updated_at DESC
         LIMIT 10`,
        [companyId]
      ),
      pool.query(
        `SELECT id, session_id FROM leads WHERE company_id = $1 AND deleted_at IS NULL`,
        [companyId]
      ),
    ]);

    const sessionToLeadId = new Map((leadSessionIdsResult.rows || []).map((r) => [r.session_id, r.id]));
    const leadSessionIds = new Set(sessionToLeadId.keys());
    const conversationsTotal = kpiResult.rows[0]?.conversations_total || 0;
    const leadsTotal = leadSummary?.total || 0;
    const conversionRate = conversationsTotal > 0 ? Math.round((leadsTotal / conversationsTotal) * 100) : 0;

    const kpis = {
      visitorsEngaged: {
        today: kpiResult.rows[0]?.conversations_today ?? 0,
        yesterday: kpiResult.rows[0]?.conversations_yesterday ?? 0,
        percentChange: (() => {
          const today = kpiResult.rows[0]?.conversations_today ?? 0;
          const yesterday = kpiResult.rows[0]?.conversations_yesterday ?? 0;
          if (yesterday === 0) return today > 0 ? 100 : 0;
          return Math.round(((today - yesterday) / yesterday) * 100);
        })(),
      },
      conversationsStarted: {
        today: kpiResult.rows[0]?.conversations_today ?? 0,
        thisWeek: kpiResult.rows[0]?.conversations_this_week ?? 0,
      },
      leadsGenerated: {
        today: kpiResult.rows[0]?.leads_today ?? 0,
        thisWeek: kpiResult.rows[0]?.leads_this_week ?? 0,
        conversionRate: conversationsTotal > 0 ? Math.round(((kpiResult.rows[0]?.leads_this_week ?? 0) / (kpiResult.rows[0]?.conversations_this_week || 1)) * 100) : 0,
      },
      meetingsRequested: {
        pending: leadSummary?.new_count ?? 0,
        completed: (leadSummary?.total ?? 0) - (leadSummary?.new_count ?? 0),
      },
      conversionRate,
      aiResponseRate: 100,
    };

    const recentLeads = (recentLeadsResult.rows || []).map((r) => ({
      id: r.id,
      sessionId: r.session_id || null,
      name: r.name || 'Unnamed',
      requirement: r.project_summary || r.status || '—',
      sourcePage: r.landing_page || '—',
      timeReceived: r.created_at,
    }));

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const recentConversations = (recentSessionsResult.rows || []).map((r) => ({
      id: r.id,
      leadId: sessionToLeadId.get(r.id) || null,
      firstMessage: (r.first_message || r.title || 'New chat').toString().slice(0, 80),
      duration: r.message_count ? `${r.message_count} messages` : '—',
      leadCaptured: leadSessionIds.has(r.id),
      status: r.updated_at >= thirtyMinutesAgo ? 'active' : 'closed',
      updatedAt: r.updated_at,
    }));

    const notifications = [];
    if (leadSummary?.new_count > 0) {
      notifications.push({ type: 'new_lead', message: `${leadSummary.new_count} new lead(s) captured`, link: '/admin/leads' });
    }
    if (leadSummary?.reminder_overdue_count > 0) {
      notifications.push({ type: 'reminder_overdue', message: `${leadSummary.reminder_overdue_count} overdue follow-up(s)`, link: '/admin/leads' });
    }
    if (leadSummary?.reminder_due_today_count > 0) {
      notifications.push({ type: 'reminder_due', message: `${leadSummary.reminder_due_today_count} reminder(s) due today`, link: '/admin/leads' });
    }
    if (getLastTrainingCompleted(companyId)) {
      notifications.push({ type: 'training_completed', message: 'Training completed. AI learned from your content.', link: '/admin/training' });
    }

    const aiInsights = [];
    if (recentLeads.length > 0) {
      const services = [...new Set(recentLeads.map((l) => l.requirement).filter(Boolean))].slice(0, 2);
      if (services.length) aiInsights.push(`Recent interest: ${services.join(', ')}`);
    }
    if (leadSummary?.hot_count > 0) {
      aiInsights.push(`${leadSummary.hot_count} high-priority lead(s) need attention`);
    }
    if (kpis.leadsGenerated.today > 0) {
      aiInsights.push(`${kpis.leadsGenerated.today} lead(s) captured today`);
    }
    if (aiInsights.length === 0) {
      aiInsights.push('Your AI agent is live. Share your website to start receiving visitors.');
    }

    const trainingJob = getActiveJobForCompany(companyId);
    const lastTrainingTs = getLastTrainingCompleted(companyId);
    const systemStatus = {
      agentName: company?.display_name || company?.name || 'AI Agent',
      status: trainingJob ? 'Training' : (company?.agent_paused ? 'Paused' : 'Online'),
      paused: Boolean(company?.agent_paused),
      trainingInProgress: Boolean(trainingJob),
      connectedDomain: company?.connected_domain || null,
      lastTrainingDate: lastTrainingTs ? new Date(lastTrainingTs).toISOString() : null,
      activeLanguages: company?.active_languages || 'English',
      voiceModeEnabled: Boolean(company?.voice_mode_enabled),
    };

    res.json({
      systemStatus,
      kpis,
      recentLeads,
      recentConversations,
      notifications,
      aiInsights,
      summary: leadSummary,
    });
  } catch (err) {
    console.error('[admin dashboard] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getLive(req, res) {
  try {
    const companyId = req.adminCompanyId;
    const active = getActiveForCompany(companyId);
    res.json({
      activeCount: active.activeCount,
      currentlyChatting: active.currentlyChatting,
      lastMessageAt: active.lastMessageAt,
      sessions: active.sessions.map((s) => ({
        sessionId: s.sessionId,
        pageUrl: s.pageUrl,
        lastSeen: s.lastSeen,
        messageCount: s.messageCount,
      })),
    });
  } catch (err) {
    console.error('[admin dashboard] live:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getDashboard, getLive };
