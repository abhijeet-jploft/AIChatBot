import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};
const labelStyle = { color: 'var(--chat-text)' };
const mutedStyle = { color: 'var(--chat-muted)' };
const headingStyle = { color: 'var(--chat-text-heading)', fontWeight: 700 };

function defaultEscalation() {
  return {
    triggers: {
      userRequestsHuman: true,
      aiConfidenceLow: false,
      urgentKeywords: true,
      angrySentiment: true,
      highValueLead: false,
    },
    actions: {
      instantNotification: true,
      autoScheduleMeeting: false,
      chatTakeoverAlert: true,
    },
    highValueLeadScoreThreshold: 75,
  };
}

function defaultSafety() {
  return {
    blockTopicsEnabled: false,
    blockTopics: '',
    preventInternalData: true,
    restrictDatabasePriceExposure: true,
    disableCompetitorComparisons: false,
    restrictFileSharing: false,
  };
}

export default function Settings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [displayName, setDisplayName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [leadEmailNotificationsEnabled, setLeadEmailNotificationsEnabled] = useState(false);
  const [leadNotificationEmail, setLeadNotificationEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [escalation, setEscalation] = useState(defaultEscalation);
  const [safety, setSafety] = useState(defaultSafety);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [logoutAllPending, setLogoutAllPending] = useState(false);

  useEffect(() => {
    authFetch('/settings')
      .then(async (settingsRes) => {
        if (!settingsRes.ok) throw new Error('Failed to load settings');
        const d = await settingsRes.json();

        setDisplayName(d.displayName || d.name || '');
        setIconUrl(d.iconUrl || '');
        setGreetingMessage(d.greetingMessage || '');
        setLeadEmailNotificationsEnabled(Boolean(d.leadNotifications?.emailEnabled));
        setLeadNotificationEmail(d.leadNotifications?.email || '');
        if (d.escalation) {
          setEscalation((prev) => ({
            triggers: { ...prev.triggers, ...d.escalation.triggers },
            actions: { ...prev.actions, ...d.escalation.actions },
            highValueLeadScoreThreshold: d.escalation.highValueLeadScoreThreshold ?? prev.highValueLeadScoreThreshold,
          }));
        }
        if (d.safety) {
          setSafety((prev) => ({ ...prev, ...d.safety }));
        }
      })
      .catch(() => showToast('Failed to load settings', 'error'));
  }, [authFetch, showToast]);

  const loadSessions = () => {
    setSessionsLoading(true);
    authFetch('/settings/sessions')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      })
      .finally(() => setSessionsLoading(false));
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          iconUrl: iconUrl.trim() || undefined,
          greetingMessage: greetingMessage.trim() || undefined,
          leadNotifications: {
            emailEnabled: leadEmailNotificationsEnabled,
            email: leadNotificationEmail.trim() || null,
          },
          escalation: {
            triggers: escalation.triggers,
            actions: escalation.actions,
            highValueLeadScoreThreshold: escalation.highValueLeadScoreThreshold,
          },
          safety: {
            blockTopicsEnabled: safety.blockTopicsEnabled,
            blockTopics: safety.blockTopics || '',
            preventInternalData: safety.preventInternalData,
            restrictDatabasePriceExposure: safety.restrictDatabasePriceExposure,
            disableCompetitorComparisons: safety.disableCompetitorComparisons,
            restrictFileSharing: safety.restrictFileSharing,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = () => {
    if (!window.confirm('Log out all admin sessions for this company? You will need to sign in again.')) return;
    setLogoutAllPending(true);
    authFetch('/settings/sessions', { method: 'DELETE' })
      .then(async (res) => {
        if (res.ok) {
          showToast('All sessions logged out', 'success');
          loadSessions();
          window.location.href = '/admin';
        } else showToast('Failed to log out sessions', 'error');
      })
      .finally(() => setLogoutAllPending(false));
  };

  const updateEscalationTrigger = (key, value) => {
    setEscalation((e) => ({ ...e, triggers: { ...e.triggers, [key]: value } }));
  };
  const updateEscalationAction = (key, value) => {
    setEscalation((e) => ({ ...e, actions: { ...e.actions, [key]: value } }));
  };
  const updateSafety = (key, value) => {
    setSafety((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Company settings</h5>
      <form onSubmit={handleSubmit}>
        <div className="row g-4 align-items-start">
          <div className="col-12 col-lg-8">
            <div className="mb-3">
              <label className="form-label">Display name</label>
              <input
                type="text"
                className="form-control"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Visible name in chatbot"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Icon URL</label>
              <input
                type="url"
                className="form-control"
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
                placeholder="https://example.com/icon.png"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              {iconUrl && (
                <div className="mt-2">
                  <img
                    src={iconUrl}
                    alt="Preview"
                    style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label">Greeting message</label>
              <textarea
                className="form-control"
                rows={3}
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="Custom welcome message"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Lead notifications</label>
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="leadEmailEnabled"
                  checked={leadEmailNotificationsEnabled}
                  onChange={(e) => setLeadEmailNotificationsEnabled(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="leadEmailEnabled">
                  Send email notification when a new lead is captured
                </label>
              </div>
              <input
                type="email"
                className="form-control"
                value={leadNotificationEmail}
                onChange={(e) => setLeadNotificationEmail(e.target.value)}
                placeholder="owner@company.com"
                disabled={!leadEmailNotificationsEnabled}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                Email includes lead name, requested service, and urgency level.
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-4">
            <div
              className="p-3 rounded-3"
              style={{
                background: 'var(--chat-surface)',
                border: '1px solid var(--chat-border)',
              }}
            >
              <div className="mb-2" style={{ color: 'var(--chat-text-heading)', fontWeight: 700 }}>
                Voice settings
              </div>

              <div className="form-text" style={mutedStyle}>
                Voice options now have a dedicated page so you can manage voice mode and male/female response voice separately.
              </div>

              <Link to="/admin/voice-settings" className="btn btn-sm btn-outline-primary mt-3">
                Open voice settings
              </Link>
            </div>
          </div>
        </div>

        {/* Escalation */}
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Escalation</div>
          <p className="small mb-3" style={mutedStyle}>When to escalate to a human and which actions to take.</p>
          <div className="row g-3">
            <div className="col-12">
              <div className="small fw-semibold mb-2" style={labelStyle}>Triggers</div>
              <div className="d-flex flex-wrap gap-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_user"
                    checked={escalation.triggers.userRequestsHuman}
                    onChange={(e) => updateEscalationTrigger('userRequestsHuman', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_user" style={labelStyle}>User requests human</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_confidence"
                    checked={escalation.triggers.aiConfidenceLow}
                    onChange={(e) => updateEscalationTrigger('aiConfidenceLow', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_confidence" style={labelStyle}>Low AI confidence</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_urgent"
                    checked={escalation.triggers.urgentKeywords}
                    onChange={(e) => updateEscalationTrigger('urgentKeywords', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_urgent" style={labelStyle}>Urgent keywords</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_angry"
                    checked={escalation.triggers.angrySentiment}
                    onChange={(e) => updateEscalationTrigger('angrySentiment', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_angry" style={labelStyle}>Angry sentiment</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_highvalue"
                    checked={escalation.triggers.highValueLead}
                    onChange={(e) => updateEscalationTrigger('highValueLead', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_highvalue" style={labelStyle}>High-value lead</label>
                </div>
              </div>
              {escalation.triggers.highValueLead && (
                <div className="mt-2">
                  <label className="form-label small mb-1" style={labelStyle}>Score threshold (0–100)</label>
                  <input type="number" min={0} max={100} className="form-control form-control-sm" style={{ maxWidth: 100, background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                    value={escalation.highValueLeadScoreThreshold}
                    onChange={(e) => setEscalation((e) => ({ ...e, highValueLeadScoreThreshold: Number(e.target.value) || 75 }))} />
                </div>
              )}
            </div>
            <div className="col-12">
              <div className="small fw-semibold mb-2" style={labelStyle}>Actions</div>
              <div className="d-flex flex-wrap gap-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_notif"
                    checked={escalation.actions.instantNotification}
                    onChange={(e) => updateEscalationAction('instantNotification', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_notif" style={labelStyle}>Instant notification</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_meeting"
                    checked={escalation.actions.autoScheduleMeeting}
                    onChange={(e) => updateEscalationAction('autoScheduleMeeting', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_meeting" style={labelStyle}>Auto-schedule meeting</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_takeover"
                    checked={escalation.actions.chatTakeoverAlert}
                    onChange={(e) => updateEscalationAction('chatTakeoverAlert', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_takeover" style={labelStyle}>Chat takeover alert</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety & Compliance */}
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Safety & Compliance</div>
          <p className="small mb-3" style={mutedStyle}>Control what the AI can say and what data it exposes.</p>
          <div className="row g-3">
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_block"
                  checked={safety.blockTopicsEnabled}
                  onChange={(e) => updateSafety('blockTopicsEnabled', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_block" style={labelStyle}>Block specific topics</label>
              </div>
              {safety.blockTopicsEnabled && (
                <input type="text" className="form-control form-control-sm mt-2" placeholder="Comma-separated topics to avoid"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                  value={safety.blockTopics}
                  onChange={(e) => updateSafety('blockTopics', e.target.value)} />
              )}
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_internal"
                  checked={safety.preventInternalData}
                  onChange={(e) => updateSafety('preventInternalData', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_internal" style={labelStyle}>Prevent exposing internal data</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_price"
                  checked={safety.restrictDatabasePriceExposure}
                  onChange={(e) => updateSafety('restrictDatabasePriceExposure', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_price" style={labelStyle}>Restrict database price exposure</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_competitor"
                  checked={safety.disableCompetitorComparisons}
                  onChange={(e) => updateSafety('disableCompetitorComparisons', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_competitor" style={labelStyle}>Disable competitor comparisons</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_file"
                  checked={safety.restrictFileSharing}
                  onChange={(e) => updateSafety('restrictFileSharing', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_file" style={labelStyle}>Restrict file sharing</label>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions */}
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Sessions</div>
          <p className="small mb-3" style={mutedStyle}>Active admin sessions for this company.</p>
          {sessionsLoading ? (
            <p className="small" style={mutedStyle}>Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="small" style={mutedStyle}>No other active sessions.</p>
          ) : (
            <ul className="small mb-3 ps-3" style={mutedStyle}>
              {sessions.slice(0, 10).map((s, i) => (
                <li key={s.id || i}>Session — created {s.created_at ? new Date(s.created_at).toLocaleString() : ''}</li>
              ))}
              {sessions.length > 10 && <li>... and {sessions.length - 10} more</li>}
            </ul>
          )}
          <button type="button" className="btn btn-outline-danger btn-sm"
            onClick={handleLogoutAll}
            disabled={logoutAllPending}>
            {logoutAllPending ? 'Logging out...' : 'Log out all sessions'}
          </button>
        </div>

        <div className="mt-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
