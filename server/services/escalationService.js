// Rules derived from: AI Chat Agent __ Feature listing and Ideas __ JPloft.docx
// 4.5.10 Escalation Settings
const { isUrgentLead } = require('./chatRules');

const HUMAN_REQUEST_RE = /\b(talk to (a )?person|talk to (someone)|real person|human agent|representative|sales (agent|rep)|customer support|speak to (someone)|hand off to|transfer to)\b/i;
const ANGRY_SENTIMENT_RE = /\b(angry|mad|furious|unhappy|hate|scam|refund|complain|complaint|bad service|terrible|worst)\b/i;
const CONFIDENCE_LOW_RE = /\b(not sure|i\'m not sure|uncertain|may need to confirm|need to confirm|might need to confirm|i can\'t be sure|not certain)\b/i;

// Simple in-memory throttle to reduce repeat alerts spam
const lastEscalationAtByKey = new Map();
const ESCALATION_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes

function shouldTrigger({ triggerEnabled, triggerDetected }) {
  return Boolean(triggerEnabled && triggerDetected);
}

function evaluateEscalation({
  companyId,
  sessionId,
  userText = '',
  responseText = '',
  leadScore = null,
  config = {},
}) {
  const user = String(userText || '');
  const response = String(responseText || '');

  const triggersCfg = config.triggers || {};
  const actionsCfg = config.actions || {};
  const highValueThreshold = Number(config.highValueLeadScoreThreshold || 75);

  const userRequestsHuman = HUMAN_REQUEST_RE.test(user);
  const urgentKeywordsDetected = isUrgentLead(user);
  const angrySentimentDetected = ANGRY_SENTIMENT_RE.test(user);
  const confidenceLowDetected = CONFIDENCE_LOW_RE.test(response) || CONFIDENCE_LOW_RE.test(user);
  const highValueLeadDetected = typeof leadScore === 'number' && leadScore >= highValueThreshold;

  const triggered = {
    userRequestsHuman: shouldTrigger({
      triggerEnabled: triggersCfg.userRequestsHuman,
      triggerDetected: userRequestsHuman,
    }),
    aiConfidenceLow: shouldTrigger({
      triggerEnabled: triggersCfg.aiConfidenceLow,
      triggerDetected: confidenceLowDetected,
    }),
    urgentKeywords: shouldTrigger({
      triggerEnabled: triggersCfg.urgentKeywords,
      triggerDetected: urgentKeywordsDetected,
    }),
    angrySentiment: shouldTrigger({
      triggerEnabled: triggersCfg.angrySentiment,
      triggerDetected: angrySentimentDetected,
    }),
    highValueLead: shouldTrigger({
      triggerEnabled: triggersCfg.highValueLead,
      triggerDetected: highValueLeadDetected,
    }),
  };

  const anyTriggered = Object.values(triggered).some(Boolean);
  if (!anyTriggered) return { shouldEscalate: false, triggered };

  const key = `${companyId || ''}:${sessionId || ''}`;
  const now = Date.now();
  const last = lastEscalationAtByKey.get(key) || 0;
  if (now - last < ESCALATION_THROTTLE_MS) {
    return { shouldEscalate: false, triggered, throttled: true };
  }
  lastEscalationAtByKey.set(key, now);

  const alerts = [];
  if (actionsCfg.instantNotification) {
    const activeReasons = Object.entries(triggered).filter(([, v]) => v).map(([k]) => k);
    alerts.push({
      kind: 'escalation_instant',
      message: `Escalation suggested (${activeReasons.join(', ')}). A human review may be needed.`,
      link: '/admin/take-over',
    });
  }
  if (actionsCfg.chatTakeoverAlert) {
    alerts.push({
      kind: 'escalation_takeover',
      message: 'Chat takeover alert: consider taking over this conversation.',
      link: '/admin/take-over',
    });
  }
  if (actionsCfg.autoScheduleMeeting) {
    alerts.push({
      kind: 'escalation_meeting',
      message: 'Auto-schedule meeting enabled (action queued / placeholder).',
      link: '/admin/leads',
    });
  }

  return { shouldEscalate: alerts.length > 0, triggered, alerts };
}

module.exports = { evaluateEscalation };

