import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};

const labelStyle = { color: 'var(--chat-text)' };
const mutedStyle = { color: 'var(--chat-muted)' };
const headingStyle = { color: 'var(--chat-text-heading)', fontWeight: 700 };

const DEFAULT_STATE = {
  channelEmail: true,
  channelDashboard: true,
  newLead: true,
  meetingRequest: true,
  trainingCompletion: true,
  payment: true,
  systemAlert: true,
};

export default function NotificationPreferences() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState({
    email: DEFAULT_STATE.channelEmail,
    dashboard: DEFAULT_STATE.channelDashboard,
  });
  const [types, setTypes] = useState({
    newLead: DEFAULT_STATE.newLead,
    meetingRequest: DEFAULT_STATE.meetingRequest,
    trainingCompletion: DEFAULT_STATE.trainingCompletion,
    payment: DEFAULT_STATE.payment,
    systemAlert: DEFAULT_STATE.systemAlert,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/notification-preferences');
        if (!res.ok) throw new Error('Failed to load');
        const d = await res.json();
        if (cancelled) return;
        if (d.channels) {
          setChannels({
            email: d.channels.email !== false,
            dashboard: d.channels.dashboard !== false,
          });
        }
        if (d.types) {
          setTypes({
            newLead: d.types.newLead !== false,
            meetingRequest: d.types.meetingRequest !== false,
            trainingCompletion: d.types.trainingCompletion !== false,
            payment: d.types.payment !== false,
            systemAlert: d.types.systemAlert !== false,
          });
        }
      } catch {
        if (!cancelled) showToast('Failed to load notification preferences', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, types }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Notification preferences saved', 'success');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: 'var(--chat-muted)' }}>Loading…</div>
    );
  }

  return (
    <div className="p-4 mx-auto" style={{ maxWidth: 720 }}>
      <h5 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>
        Notification preferences
      </h5>
      <p className="small mb-4" style={mutedStyle}>
        Choose which system notifications you receive. Channels control how alerts are delivered; types control which events generate notifications.
        Outgoing mail for this company is configured under{' '}
        <NavLink to="/admin/email-smtp" style={{ color: 'var(--bs-primary)' }}>Email (SMTP)</NavLink>
        {' '}(or the server default if host is left empty). Lead notification recipients are set in{' '}
        <strong style={{ color: 'var(--chat-text)' }}>Settings → Widget, embed &amp; leads</strong>.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Notification channels</div>
          <p className="small mb-3" style={mutedStyle}>
            When a channel is off, that delivery method is not used (even if a notification type is on).
          </p>
          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="ch-email"
              checked={channels.email}
              onChange={(e) => setChannels((c) => ({ ...c, email: e.target.checked }))}
            />
            <label className="form-check-label" htmlFor="ch-email" style={labelStyle}>
              Email notifications
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="ch-dashbd"
              checked={channels.dashboard}
              onChange={(e) => setChannels((c) => ({ ...c, dashboard: e.target.checked }))}
            />
            <label className="form-check-label" htmlFor="ch-dashbd" style={labelStyle}>
              Dashboard alerts
            </label>
            <div className="form-text" style={mutedStyle}>
              In-app banner notifications on the dashboard and live WebSocket alerts where connected.
            </div>
          </div>
        </div>

        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Notification types</div>
          <p className="small mb-3" style={mutedStyle}>
            Turn individual event types on or off. They apply per enabled channel above.
          </p>
          {[
            { key: 'newLead', id: 't-lead', label: 'New lead captured' },
            { key: 'meetingRequest', id: 't-meeting', label: 'Meeting request received' },
            { key: 'trainingCompletion', id: 't-train', label: 'Training completion' },
            { key: 'payment', id: 't-pay', label: 'Payment notifications' },
            { key: 'systemAlert', id: 't-sys', label: 'System alerts (e.g. escalations, support requests)' },
          ].map(({ key, id, label }) => (
            <div className="form-check mb-2" key={key}>
              <input
                className="form-check-input"
                type="checkbox"
                id={id}
                checked={types[key]}
                onChange={(e) => setTypes((t) => ({ ...t, [key]: e.target.checked }))}
              />
              <label className="form-check-label" htmlFor={id} style={labelStyle}>{label}</label>
            </div>
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </form>
    </div>
  );
}
