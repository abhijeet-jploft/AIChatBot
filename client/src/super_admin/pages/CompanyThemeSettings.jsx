import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const DEFAULT_HEADER_SHADOW = '0 4px 12px rgba(224, 47, 58, 0.25)';

export default function CompanyThemeSettings() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState({
    primaryColor: '#E02F3A',
    primaryDarkColor: '#B02530',
    secondaryColor: '#000000',
    secondaryLightColor: '#1A1A1A',
    headerBackground: '#000000',
    headerShadow: DEFAULT_HEADER_SHADOW,
    headerTextColor: '#FFFFFF',
  });

  useEffect(() => {
    saFetch(`/companies/${companyId}/settings`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load theme');
        const t = d.theme || {};
        setTheme((prev) => ({
          ...prev,
          primaryColor: t.primaryColor || prev.primaryColor,
          primaryDarkColor: t.primaryDarkColor || prev.primaryDarkColor,
          secondaryColor: t.secondaryColor || prev.secondaryColor,
          secondaryLightColor: t.secondaryLightColor || prev.secondaryLightColor,
          headerBackground: t.headerBackground || prev.headerBackground,
          headerShadow: t.headerShadow || prev.headerShadow,
          headerTextColor: t.headerTextColor || prev.headerTextColor,
        }));
      })
      .catch((err) => showToast(err.message || 'Failed to load theme', 'error'))
      .finally(() => setLoading(false));
  }, [companyId, saFetch, showToast]);

  const setField = (k, v) => setTheme((p) => ({ ...p, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save theme');
      showToast('Theme saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save theme', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading theme…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Configurations</Link>
          <h2 className="sa-page-title">Theme</h2>
        </div>
      </div>

      <form className="sa-panel" onSubmit={handleSave}>
        <div className="sa-field-row">
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Primary</label>
            <input type="color" value={theme.primaryColor} onChange={(e) => setField('primaryColor', e.target.value)} />
          </div>
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Primary dark</label>
            <input type="color" value={theme.primaryDarkColor} onChange={(e) => setField('primaryDarkColor', e.target.value)} />
          </div>
        </div>
        <div className="sa-field-row">
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Secondary</label>
            <input type="color" value={theme.secondaryColor} onChange={(e) => setField('secondaryColor', e.target.value)} />
          </div>
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Secondary light</label>
            <input type="color" value={theme.secondaryLightColor} onChange={(e) => setField('secondaryLightColor', e.target.value)} />
          </div>
        </div>
        <div className="sa-field-row">
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Header background</label>
            <input type="text" value={theme.headerBackground} onChange={(e) => setField('headerBackground', e.target.value)} />
          </div>
          <div className="sa-field" style={{ flex: 1 }}>
            <label>Header text color</label>
            <input type="text" value={theme.headerTextColor} onChange={(e) => setField('headerTextColor', e.target.value)} />
          </div>
        </div>
        <div className="sa-field">
          <label>Header shadow</label>
          <input type="text" value={theme.headerShadow} onChange={(e) => setField('headerShadow', e.target.value)} />
        </div>
        <div className="sa-field-actions">
          <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save theme'}</button>
        </div>
      </form>
    </div>
  );
}
