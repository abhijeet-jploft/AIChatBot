import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

export default function ConversationMode() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [modeCatalog, setModeCatalog] = useState(null);
  const [selectedMode, setSelectedMode] = useState('mixed_mode');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([authFetch('/settings'), authFetch('/settings/modes')])
      .then(async ([settingsRes, modesRes]) => {
        if (!settingsRes.ok || !modesRes.ok) throw new Error('Failed to load mode settings');

        const settings = await settingsRes.json();
        const modes = await modesRes.json();

        setModeCatalog(modes || null);
        setSelectedMode(settings.aiMode?.mode || modes?.active?.mode || 'mixed_mode');
      })
      .catch(() => showToast('Failed to load mode settings', 'error'));
  }, [authFetch, showToast]);

  const handleSaveMode = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiMode: selectedMode }),
      });
      if (!res.ok) throw new Error('Failed to save mode');

      const updated = await res.json();
      if (updated?.aiMode?.mode) {
        setSelectedMode(updated.aiMode.mode);
      }
      if (updated?.aiMode) {
        setModeCatalog((prev) => (prev ? { ...prev, active: updated.aiMode } : prev));
      }

      showToast('AI mode updated', 'success');
    } catch {
      showToast('Failed to save AI mode', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>AI mode</h5>
      <p className="small mb-4" style={{ color: 'var(--chat-muted)', maxWidth: 760 }}>
        Select the primary conversation goal from the specification: Lead Generation, Meeting Booking, Product Recommendation,
        Customer Support, or Mixed Mode.
      </p>

      {!modeCatalog ? (
        <div className="text-muted small">Loading AI mode catalog...</div>
      ) : (
        <div style={{ maxWidth: 760 }}>
          <div className="card mb-3" style={{ background: 'var(--chat-sidebar)', borderColor: 'var(--chat-border)' }}>
            <div className="card-body">
              <div className="small text-muted mb-1">Current active mode</div>
              <div style={{ color: 'var(--chat-text)' }}>
                <strong>{modeCatalog.active?.label || modeCatalog.active?.mode || 'N/A'}</strong>
              </div>
              <div className="small mt-2" style={{ color: 'var(--chat-muted)' }}>
                {modeCatalog.active?.description || 'No description available.'}
              </div>
            </div>
          </div>

          <div className="d-flex flex-column gap-2 mb-4">
            {(modeCatalog.options?.modes || []).map((mode) => (
              <label
                key={mode.id}
                className="form-check p-3 rounded"
                style={{ border: '1px solid var(--chat-border)', background: 'var(--chat-surface)' }}
              >
                <input
                  className="form-check-input"
                  type="radio"
                  name="aiMode"
                  value={mode.id}
                  checked={selectedMode === mode.id}
                  onChange={(e) => setSelectedMode(e.target.value)}
                />
                <span className="form-check-label ms-2" style={{ color: 'var(--chat-text)' }}>
                  <strong>{mode.label}</strong>
                </span>
                <div className="small mt-1" style={{ color: 'var(--chat-muted)', marginLeft: '1.5rem' }}>
                  {mode.description}
                </div>
              </label>
            ))}
          </div>

          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveMode}>
            {saving ? 'Saving...' : 'Save mode'}
          </button>
        </div>
      )}
    </div>
  );
}
