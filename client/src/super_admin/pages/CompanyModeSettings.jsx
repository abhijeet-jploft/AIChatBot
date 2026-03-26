import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import { getAiModePermissionKey, hasPermission } from '../lib/permissions';

export default function CompanyModeSettings() {
  const { companyId } = useParams();
  const { admin, saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modeCatalog, setModeCatalog] = useState(null);
  const [selectedMode, setSelectedMode] = useState('mixed_mode');
  const canEditSelectedMode = hasPermission(admin, getAiModePermissionKey(selectedMode) || 'ai_configuration', 'edit');

  useEffect(() => {
    Promise.all([
      saFetch(`/companies/${companyId}/settings`),
      saFetch(`/companies/${companyId}/settings/modes`),
    ])
      .then(async ([settingsRes, modesRes]) => {
        const s = await settingsRes.json();
        const m = await modesRes.json();
        if (!settingsRes.ok) throw new Error(s.error || 'Failed to load settings');
        if (!modesRes.ok) throw new Error(m.error || 'Failed to load mode catalog');
        setModeCatalog(m || null);
        setSelectedMode(s.aiMode?.mode || m?.active?.mode || 'mixed_mode');
      })
      .catch((err) => showToast(err.message || 'Failed to load mode settings', 'error'))
      .finally(() => setLoading(false));
  }, [companyId, saFetch, showToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiMode: selectedMode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save mode');
      if (d?.aiMode?.mode) setSelectedMode(d.aiMode.mode);
      showToast('AI mode updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save AI mode', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading mode settings…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Configurations</Link>
          <h2 className="sa-page-title">AI Mode</h2>
        </div>
      </div>

      {!modeCatalog ? (
        <div className="sa-empty-sm">No mode catalog available.</div>
      ) : (
        <div className="sa-panel">
          <div className="sa-text-muted sa-mb">Current active mode: <strong>{modeCatalog.active?.label || modeCatalog.active?.mode || 'N/A'}</strong></div>
          <div className="d-flex flex-column gap-2">
            {(modeCatalog.options?.modes || []).map((mode) => (
              <label key={mode.id} className="sa-field-check">
                <input
                  type="radio"
                  name="aiMode"
                  value={mode.id}
                  checked={selectedMode === mode.id}
                  onChange={(e) => setSelectedMode(e.target.value)}
                />
                <span><strong>{mode.label}</strong> — {mode.description}</span>
              </label>
            ))}
          </div>
          <div className="sa-field-actions">
            <button type="button" className="sa-btn sa-btn-primary" disabled={saving || !canEditSelectedMode} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save mode'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
