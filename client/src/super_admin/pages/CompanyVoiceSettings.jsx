import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const FALLBACK_VOICE_CATALOG = [
  { id: 'professional', label: 'Professional' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'sales', label: 'Sales' },
];

// Keep super-admin local filtering aligned with server-side behavior.
const PROFILE_LANGUAGE_SUPPORT = {
  professional: '*',
  corporate: '*',
  sales: ['en', 'es', 'pt', 'de', 'fr', 'it'],
};

export default function CompanyVoiceSettings() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();
  const previewAudioRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceListLoading, setVoiceListLoading] = useState(false);
  const [previewLoadingKey, setPreviewLoadingKey] = useState(null);
  const [playingPreviewKey, setPlayingPreviewKey] = useState(null);

  const [voice, setVoice] = useState({
    enabled: false,
    responseEnabled: true,
    gender: 'female',
    profile: 'professional',
    ignoreEmoji: false,
    ttsLanguageCode: '',
    ttsLanguageCatalog: [{ code: '', label: 'Auto — detect from message text' }],
    catalog: FALLBACK_VOICE_CATALOG,
  });
  const [voiceList, setVoiceList] = useState([]);
  const [filterGender, setFilterGender] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const profiles = useMemo(() => {
    const list = Array.isArray(voice.catalog) ? voice.catalog : [];
    if (!list.length) return FALLBACK_VOICE_CATALOG;
    return list.map((v) => ({ id: v.id, label: v.label || v.id }));
  }, [voice.catalog]);

  const selectedVoiceKey = `${voice.profile || 'professional'}:${voice.gender === 'male' ? 'male' : 'female'}`;

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      } catch {
        // ignore
      }
      previewAudioRef.current = null;
    }
    setPlayingPreviewKey(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const loadSettings = useCallback(async () => {
    const res = await saFetch(`/companies/${companyId}/settings`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to load voice settings');
    setVoice((prev) => ({
      ...prev,
      ...(d.voice || {}),
      ttsLanguageCatalog:
        Array.isArray(d.voice?.ttsLanguageCatalog) && d.voice.ttsLanguageCatalog.length
          ? d.voice.ttsLanguageCatalog
          : [{ code: '', label: 'Auto — detect from message text' }],
    }));
  }, [companyId, saFetch]);

  const loadVoiceList = useCallback(async () => {
    setVoiceListLoading(true);
    try {
      const catalog = Array.isArray(voice.catalog) ? voice.catalog : [];
      const query = searchQuery.trim().toLowerCase();
      const rows = [];
      for (const profile of catalog) {
        const profileId = String(profile?.id || '').trim();
        if (!profileId) continue;
        const profileLabel = String(profile?.label || profileId);
        const lang = String(voice.ttsLanguageCode || '').trim().toLowerCase();
        const support = PROFILE_LANGUAGE_SUPPORT[profileId] || '*';
        if (lang && support !== '*' && !support.includes(lang)) continue;
        if (filterProfile !== 'all' && profileId !== filterProfile) continue;
        for (const gender of ['female', 'male']) {
          if (filterGender !== 'all' && gender !== filterGender) continue;
          const voiceName = String(profile?.voices?.[gender]?.label || '').trim();
          if (!voiceName) continue;
          if (query) {
            const qVoice = voiceName.toLowerCase();
            const qProfile = profileLabel.toLowerCase();
            if (!qVoice.includes(query) && !qProfile.includes(query)) continue;
          }
          rows.push({
            profileId,
            profileLabel,
            gender,
            voiceName,
          });
        }
      }
      setVoiceList(rows);
    } catch {
      setVoiceList([]);
    } finally {
      setVoiceListLoading(false);
    }
  }, [filterGender, filterProfile, searchQuery, voice.catalog, voice.ttsLanguageCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSettings();
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load voice settings', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings, showToast]);

  useEffect(() => {
    if (!loading) loadVoiceList();
  }, [loading, loadVoiceList]);

  const choosePreset = (next) => {
    setVoice((prev) => ({
      ...prev,
      ...next,
      enabled: true,
      responseEnabled: true,
    }));
  };

  const handlePreviewVoice = useCallback(async (profileId, gender) => {
    const key = `${profileId}:${gender}`;
    if (playingPreviewKey === key) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewLoadingKey(key);
    try {
      const res = await saFetch(`/companies/${companyId}/settings/voice-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: profileId,
          gender,
          ttsLanguageCode: voice.ttsLanguageCode || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.audioDataUrl) throw new Error(d.error || 'Voice preview unavailable');

      const audio = new Audio(d.audioDataUrl);
      previewAudioRef.current = audio;
      const clear = () => {
        if (previewAudioRef.current === audio) previewAudioRef.current = null;
        setPlayingPreviewKey(null);
      };
      audio.onended = clear;
      audio.onerror = clear;
      await audio.play();
      setPlayingPreviewKey(key);
    } catch (err) {
      showToast(err.message || 'Voice preview failed', 'error');
    } finally {
      setPreviewLoadingKey((v) => (v === key ? null : v));
    }
  }, [companyId, playingPreviewKey, saFetch, showToast, stopPreview, voice.ttsLanguageCode]);

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
            ttsLanguageCode: String(voice.ttsLanguageCode || '').trim() || null,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save voice settings');
      showToast('Voice settings saved', 'success');
      await loadSettings();
      await loadVoiceList();
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
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Back</Link>
          <h2 className="sa-page-title">Voice Settings</h2>
        </div>
      </div>

      <form className="sa-panel" onSubmit={handleSave}>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.enabled)} onChange={(e) => setVoice((p) => ({ ...p, enabled: e.target.checked }))} />Enable voice mode</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.responseEnabled)} onChange={(e) => setVoice((p) => ({ ...p, responseEnabled: e.target.checked }))} />Voice response enabled</label></div>

        <div className="sa-field-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="sa-field" style={{ minWidth: 220, flex: 1 }}>
            <label>Voice profile</label>
            <select value={voice.profile || 'professional'} onChange={(e) => choosePreset({ profile: e.target.value })}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="sa-field" style={{ minWidth: 220, flex: 1 }}>
            <label>Voice gender</label>
            <select value={voice.gender === 'male' ? 'male' : 'female'} onChange={(e) => choosePreset({ gender: e.target.value === 'male' ? 'male' : 'female' })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
        </div>

        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(voice.ignoreEmoji)} onChange={(e) => setVoice((p) => ({ ...p, ignoreEmoji: e.target.checked }))} />Ignore emoji in voice output</label></div>
        <div className="sa-field">
          <label>Spoken language (Text-to-Speech API)</label>
          <select value={voice.ttsLanguageCode || ''} onChange={(e) => setVoice((p) => ({ ...p, ttsLanguageCode: e.target.value }))}>
            {(Array.isArray(voice.ttsLanguageCatalog) && voice.ttsLanguageCatalog.length
              ? voice.ttsLanguageCatalog
              : [{ code: '', label: 'Auto — detect from message text' }]
            ).map((opt) => (
              <option key={opt.code || 'auto'} value={opt.code}>{opt.label}</option>
            ))}
          </select>
        </div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Preset voices</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 8, marginBottom: 10 }}>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by voice or type..." />
          <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
            <option value="all">All genders</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)}>
            <option value="all">All types</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--sa-text)' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--sa-text-heading)', borderBottom: '1px solid var(--sa-border)' }}>Voice name</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--sa-text-heading)', borderBottom: '1px solid var(--sa-border)' }}>Gender</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--sa-text-heading)', borderBottom: '1px solid var(--sa-border)' }}>Voice type</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--sa-text-heading)', borderBottom: '1px solid var(--sa-border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {voiceListLoading ? (
                <tr><td colSpan={4} style={{ padding: 10, color: 'var(--sa-text-muted)' }}>Loading...</td></tr>
              ) : voiceList.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 10, color: 'var(--sa-text-muted)' }}>No voices match filters.</td></tr>
              ) : (
                voiceList.map((row) => {
                  const rowKey = `${row.profileId}:${row.gender}`;
                  const isSelected = selectedVoiceKey === rowKey;
                  const isLoading = previewLoadingKey === rowKey;
                  const isPlaying = playingPreviewKey === rowKey;
                  return (
                    <tr key={rowKey} style={isSelected ? { background: 'rgba(108, 99, 255, 0.14)' } : undefined}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--sa-text-heading)', borderBottom: '1px solid var(--sa-border)' }}>{row.voiceName}</td>
                      <td style={{ padding: '8px 6px', textTransform: 'capitalize', color: 'var(--sa-text)', borderBottom: '1px solid var(--sa-border)' }}>{row.gender}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--sa-text)', borderBottom: '1px solid var(--sa-border)' }}>{row.profileLabel}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" style={{ marginRight: 6 }} onClick={() => handlePreviewVoice(row.profileId, row.gender)} disabled={isLoading}>
                          {isLoading ? '...' : (isPlaying ? 'Stop' : 'Hear voice')}
                        </button>
                        <button type="button" className={`sa-btn sa-btn-sm ${isSelected ? 'sa-btn-primary' : 'sa-btn-ghost'}`} onClick={() => choosePreset({ profile: row.profileId, gender: row.gender })}>
                          {isSelected ? 'Selected' : 'Choose'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="sa-field-actions" style={{ marginTop: 12 }}>
          <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save voice settings'}</button>
        </div>
      </form>
    </div>
  );
}
