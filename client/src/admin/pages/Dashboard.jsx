import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [summary, setSummary] = useState({
    total: 0,
    new_count: 0,
    hot_count: 0,
    reminder_due_today_count: 0,
    reminder_overdue_count: 0,
    latest_new_lead: null,
  });

  useEffect(() => {
    authFetch('/leads/summary')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load summary');
        const data = await res.json();
        setSummary({
          total: Number(data?.total || 0),
          new_count: Number(data?.new_count || 0),
          hot_count: Number(data?.hot_count || 0),
          reminder_due_today_count: Number(data?.reminder_due_today_count || 0),
          reminder_overdue_count: Number(data?.reminder_overdue_count || 0),
          latest_new_lead: data?.latest_new_lead || null,
        });
      })
      .catch(() => setSummary({
        total: 0,
        new_count: 0,
        hot_count: 0,
        reminder_due_today_count: 0,
        reminder_overdue_count: 0,
        latest_new_lead: null,
      }));
  }, [authFetch]);

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Dashboard</h5>

      <div className="alert mb-3" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)', color: 'var(--chat-text)' }}>
        <strong>Leads alert:</strong> {summary.new_count} new lead{summary.new_count === 1 ? '' : 's'} awaiting action,
        {' '}with {summary.hot_count} high-priority (Hot/Very Hot) lead{summary.hot_count === 1 ? '' : 's'}.
        {' '}Reminders due today: {summary.reminder_due_today_count}.
        {' '}Overdue follow-ups: {summary.reminder_overdue_count}.
        {summary.latest_new_lead ? (
          <div className="mt-2 small">
            Latest lead: <strong>{summary.latest_new_lead.name || 'Unnamed lead'}</strong>
            {' '}| Service: {summary.latest_new_lead.service_requested || 'Not specified'}
            {' '}| Urgency: {String(summary.latest_new_lead.urgency_level || 'low').toUpperCase()}
          </div>
        ) : null}
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <Link to="leads" className="text-decoration-none">
            <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-body">
                <h6 className="card-title" style={{ color: 'var(--chat-text-heading)' }}>Leads</h6>
                <p className="card-text small text-muted mb-1">
                  View captured leads, status, notes, and transcripts
                </p>
                <div className="small" style={{ color: 'var(--chat-text)' }}>
                  Total captured: {summary.total}
                </div>
              </div>
            </div>
          </Link>
        </div>
        <div className="col-md-6">
          <Link to="settings" className="text-decoration-none">
            <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-body">
                <h6 className="card-title" style={{ color: 'var(--chat-text-heading)' }}>Settings</h6>
                <p className="card-text small text-muted mb-0">
                  Change display name, icon, and greeting message
                </p>
              </div>
            </div>
          </Link>
        </div>
        <div className="col-md-6">
          <Link to="training" className="text-decoration-none">
            <div className="card h-100" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="card-body">
                <h6 className="card-title" style={{ color: 'var(--chat-text-heading)' }}>Training</h6>
                <p className="card-text small text-muted mb-0">
                  Scrape website and train AI with your data
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
