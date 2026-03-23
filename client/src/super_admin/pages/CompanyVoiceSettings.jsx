import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

export default function CompanyVoiceSettings() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voice, setVoice] = useState({
    enabled: false,
    responseEnabled: true,
    gender: 'female',
    profile: 'professional',
    ignoreEmoji: false,
    catalog: [],
  });

  useEffect(() => {
    saFetch(`/companies/${companyId}/settings`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load voice settings');
        setVoice((prev) => ({ ...prev, ...(d.voice || {}) }));
      })
      .catch((err) => showToast(err.message || 'Failed to load voice settings', 'error'))
      .finally(() => setLoading(false));
  }, [companyId, saFetch, showToast]);

  const profiles = useMemo(() => {
    const list = Array.isArray(voice.catalog) ? voice.catalog : [];
    if (!list.length) {
      return [
        { id: 'professional', label: 'Professional' },
        { id: 'corporate', label: 'Corporate' },
        { id: 'sales', label: 'Sales' },
      ];
    }
    return list.map((v) => ({ id: v.id, label: v.label || v.id }));
  }, [voice.catalog]);

  const setField = (k, v) => setVoice((p) => ({ ...p, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            enabled: Boolean(voice.enabled),
            responseEnabled: Boolean(voice.responseEnabled),
            gender: voice.gender === 'male' ? 'male' : 'female',
            profile: voice.profile,
            ignoreEmoji: Boolean(voice.ignoreEmoji),
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save voice settings');
      showToast('Voice settings saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save voice settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading voice settings…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Configurations</Link>
          <h2 className="sa-page-title">Voice Settings</h2>
        </div>
      </div>

      <form className="sa-panel" onSubmit={handleSave}>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.enabled)} onChange={(e) => setField('enabled', e.target.checked)} />Enable voice mode</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.responseEnabled)} onChange={(e) => setField('responseEnabled', e.target.checked)} />Voice response enabled</label></div>
        <div className="sa-field">
          <label>Voice profile</label>
          <select value={voice.profile || 'professional'} onChange={(e) => setField('profile', e.target.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="sa-field">
          <label>Voice gender</label>
          <select value={voice.gender === 'male' ? 'male' : 'female'} onChange={(e) => setField('gender', e.target.value === 'male' ? 'male' : 'female')}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.ignoreEmoji)} onChange={(e) => setField('ignoreEmoji', e.target.checked)} />Ignore emoji in voice output</label></div>
        <div className="sa-field-actions">
          <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save voice settings'}</button>
        </div>
      </form>
    </div>
  );
}
