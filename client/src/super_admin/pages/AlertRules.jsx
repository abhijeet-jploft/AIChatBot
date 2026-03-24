import { useState, useEffect } from 'react';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const RULE_TYPES = ['lead_threshold', 'conversation_spike', 'system_memory', 'error_rate', 'custom'];
const EXAMPLE_RULE = {
  name: 'High error rate in last 5 minutes',
  description: 'Alert when application errors spike above acceptable threshold.',
  rule_type: 'error_rate',
  conditions: {
    windowMinutes: 5,
    minEvents: 50,
    errorRatePercentGte: 8,
    scope: 'global',
  },
  actions: {
    notify: ['email', 'slack'],
    emailTo: ['ops@yourcompany.com'],
    slackWebhook: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
    severity: 'high',
    cooldownMinutes: 15,
  },
  enabled: true,
};

export default function AlertRules() {
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', rule_type: 'lead_threshold', conditions: '{}', actions: '{}', enabled: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await saFetch('/alert-rules');
      if (!res.ok) throw new Error('Failed to load rules');
      setRules(await res.json());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let conditions, actions;
      try { conditions = JSON.parse(form.conditions); } catch { throw new Error('conditions must be valid JSON'); }
      try { actions = JSON.parse(form.actions); } catch { throw new Error('actions must be valid JSON'); }
      const res = await saFetch('/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, conditions, actions }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      showToast('Alert rule created', 'success');
      setShowCreate(false);
      setForm({ name: '', description: '', rule_type: 'lead_threshold', conditions: '{}', actions: '{}', enabled: true });
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      const res = await saFetch(`/alert-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this alert rule?')) return;
    try {
      const res = await saFetch(`/alert-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Deleted', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const applyExample = () => {
    setForm({
      name: EXAMPLE_RULE.name,
      description: EXAMPLE_RULE.description,
      rule_type: EXAMPLE_RULE.rule_type,
      conditions: JSON.stringify(EXAMPLE_RULE.conditions, null, 2),
      actions: JSON.stringify(EXAMPLE_RULE.actions, null, 2),
      enabled: EXAMPLE_RULE.enabled,
    });
    setShowCreate(true);
  };

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <h2 className="sa-page-title">Alert Rules</h2>
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={applyExample}>
            Use Example
          </button>
          <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => setShowCreate(true)}>+ New Rule</button>
        </div>
      </div>

      <div className="sa-panel sa-panel-compact" style={{ marginBottom: 12 }}>
        <h4 className="sa-panel-title">How it works (example)</h4>
        <div className="sa-text-muted sa-text-sm">
          <strong>Example:</strong> Create a rule with <code className="sa-code">rule_type = error_rate</code>,
          set <code className="sa-code">windowMinutes: 5</code> and <code className="sa-code">errorRatePercentGte: 8</code>.
          When error rate crosses 8% within 5 minutes, actions run (email/slack), then cooldown prevents repeats.
        </div>
        <div className="sa-text-muted sa-text-sm" style={{ marginTop: 8 }}>
          <strong>Conditions JSON</strong> = trigger logic (threshold/time window/scope). <strong>Actions JSON</strong> = what to do (notify channels, recipients, severity, cooldown).
        </div>
      </div>

      {showCreate && (
        <div className="sa-modal-overlay">
          <div className="sa-modal">
            <div className="sa-modal-header">
              <h4>Create Alert Rule</h4>
              <button type="button" className="sa-modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="sa-field">
                <label>Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="sa-field">
                <label>Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="sa-field">
                <label>Rule Type</label>
                <select value={form.rule_type} onChange={(e) => setForm({ ...form, rule_type: e.target.value })}>
                  {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="sa-field">
                <label>Conditions (JSON)</label>
                <textarea rows={3} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="sa-textarea-code" />
              </div>
              <div className="sa-field">
                <label>Actions (JSON)</label>
                <textarea rows={3} value={form.actions} onChange={(e) => setForm({ ...form, actions: e.target.value })} className="sa-textarea-code" />
              </div>
              <div className="sa-field sa-field-check">
                <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
              </div>
              <div className="sa-modal-footer">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="sa-loading">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="sa-empty">No alert rules. Create one to monitor system events.</div>
      ) : (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Enabled</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.description && <div className="sa-text-muted sa-text-sm">{r.description}</div>}
                  </td>
                  <td><code className="sa-code">{r.rule_type}</code></td>
                  <td>
                    <button
                      type="button"
                      className={`sa-toggle ${r.enabled ? 'sa-toggle-on' : ''}`}
                      onClick={() => handleToggle(r)}
                      aria-label={r.enabled ? 'Disable' : 'Enable'}
                    >
                      {r.enabled ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="sa-btn sa-btn-danger sa-btn-xs" onClick={() => handleDelete(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
