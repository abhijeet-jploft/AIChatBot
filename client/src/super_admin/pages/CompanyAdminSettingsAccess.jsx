import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';
import {
  mergeAdminVisibility,
} from '../../constants/adminVisibility';

export default function CompanyAdminSettingsAccess() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [presetVoiceRows, setPresetVoiceRows] = useState([]);
  const [voiceListLoading, setVoiceListLoading] = useState(false);
  const [spokenLanguageCode, setSpokenLanguageCode] = useState('');
  const [spokenLanguageCatalog, setSpokenLanguageCatalog] = useState([{ code: '', label: 'Auto - detect from message text' }]);
  const [filterGender, setFilterGender] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [access, setAccess] = useState(() => mergeAdminVisibility());

  const loadPresetVoices = useCallback(async (languageCode) => {
    setVoiceListLoading(true);
    try {
      const params = new URLSearchParams();
      const lang = String(languageCode || '').trim();
      if (lang) params.set('language', lang);
      const path = params.toString()
        ? `/companies/${companyId}/settings/voices?${params.toString()}`
        : `/companies/${companyId}/settings/voices`;
      const voicesRes = await saFetch(path);
      const voicesData = await voicesRes.json();
      if (!voicesRes.ok) throw new Error(voicesData.error || 'Failed to load preset voices');
      setPresetVoiceRows(
        Array.isArray(voicesData?.voices)
          ? voicesData.voices.filter((row) => row?.profileId && row?.gender && row?.voiceName)
          : []
      );
    } finally {
      setVoiceListLoading(false);
    }
  }, [companyId, saFetch]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [settingsRes] = await Promise.all([
          saFetch(`/companies/${companyId}/settings`),
        ]);
        const data = await settingsRes.json();
        if (!settingsRes.ok) throw new Error(data.error || 'Failed to load admin settings access');
        if (cancelled) return;
        const catalog = Array.isArray(data?.voice?.ttsLanguageCatalog) && data.voice.ttsLanguageCatalog.length
          ? data.voice.ttsLanguageCatalog
          : [{ code: '', label: 'Auto - detect from message text' }];
        const selectedLang = String(data?.voice?.ttsLanguageCode || '').trim();
        setSpokenLanguageCatalog(catalog);
        setSpokenLanguageCode(selectedLang);
        setAccess(mergeAdminVisibility(data?.adminVisibility));
        await loadPresetVoices(selectedLang);
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Failed to load admin settings access', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, saFetch, showToast, loadPresetVoices]);

  const presetVoiceOptions = useMemo(() => {
    const unique = new Map();
    (presetVoiceRows || []).forEach((row) => {
      const profileId = String(row.profileId || '').trim().toLowerCase();
      if (!profileId) return;
      const gender = String(row.gender || '').trim().toLowerCase() === 'male' ? 'male' : 'female';
      const key = `${profileId}:${gender}`;
      if (unique.has(key)) return;
      unique.set(key, {
        key,
        profileId,
        profileLabel: String(row.profileLabel || row.profileId || '').trim() || profileId,
        gender,
        voiceName: String(row.voiceName || '').trim() || 'Preset voice',
      });
    });
    return Array.from(unique.values());
  }, [presetVoiceRows]);
  const selectedPresetVoiceKeys = useMemo(
    () => {
      const allKeys = presetVoiceOptions.map((row) => row.key);
      const languageScope = String(spokenLanguageCode || '').trim().toLowerCase() || '__auto__';
      const byScope = access.voice.allowedPresetVoiceKeys || {};
      const scoped = Array.isArray(byScope[languageScope]) ? byScope[languageScope] : null;
      if (scoped == null) return allKeys;
      return allKeys.filter((key) => scoped.includes(key));
    },
    [access.voice.allowedPresetVoiceKeys, spokenLanguageCode, presetVoiceOptions]
  );
  const filteredPresetVoiceOptions = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    return presetVoiceOptions.filter((row) => {
      if (filterGender !== 'all' && row.gender !== filterGender) return false;
      if (filterProfile !== 'all' && row.profileId !== filterProfile) return false;
      if (!query) return true;
      return row.voiceName.toLowerCase().includes(query) || row.profileLabel.toLowerCase().includes(query);
    });
  }, [presetVoiceOptions, filterGender, filterProfile, searchQuery]);
  const presetProfileOptions = useMemo(() => {
    const map = new Map();
    presetVoiceOptions.forEach((row) => {
      if (!map.has(row.profileId)) map.set(row.profileId, row.profileLabel);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [presetVoiceOptions]);

  const togglePresetVoice = (key, checked) => {
    setAccess((prev) => {
      const allKeys = presetVoiceOptions.map((item) => item.key);
      const languageScope = String(spokenLanguageCode || '').trim().toLowerCase() || '__auto__';
      const currentScoped = prev.voice.allowedPresetVoiceKeys || {};
      const currentKeys = Array.isArray(currentScoped[languageScope]) ? currentScoped[languageScope] : allKeys;
      const nextKeys = checked
        ? Array.from(new Set([...currentKeys, key]))
        : currentKeys.filter((entry) => entry !== key);
      const nextAllowedPresetVoiceKeys = { ...(prev.voice.allowedPresetVoiceKeys || {}) };
      if (nextKeys.length === allKeys.length) {
        delete nextAllowedPresetVoiceKeys[languageScope];
      } else {
        nextAllowedPresetVoiceKeys[languageScope] = nextKeys;
      }

      return {
        ...prev,
        voice: {
          ...prev.voice,
          allowedPresetVoiceKeys: nextAllowedPresetVoiceKeys,
        },
      };
    });
  };

  const setAllPresetVoices = () => {
    setAccess((prev) => ({
      ...prev,
      voice: {
        ...prev.voice,
        allowedPresetVoiceKeys: (() => {
          const languageScope = String(spokenLanguageCode || '').trim().toLowerCase() || '__auto__';
          const next = { ...(prev.voice.allowedPresetVoiceKeys || {}) };
          delete next[languageScope];
          return next;
        })(),
      },
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings/admin-visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(access),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save admin settings access');
      setAccess(mergeAdminVisibility(data?.adminVisibility));
      showToast('Admin settings access updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save admin settings access', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading admin settings access…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Configurations</Link>
          <h2 className="sa-page-title">Admin Settings Access</h2>
          <p className="sa-text-muted sa-mb">
            Choose which configuration areas the company admin can see and edit. Basic company settings and full theme settings stay available by default.
          </p>
        </div>
        <button type="submit" form="sa-admin-settings-access-form" className="sa-btn sa-btn-primary sa-btn-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save access'}
        </button>
      </div>

      <form id="sa-admin-settings-access-form" className="sa-panel" onSubmit={handleSave}>
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Always available</h4>
        <div className="sa-text-muted" style={{ marginBottom: 16 }}>
          Company settings basics, website embed, sessions, password management, and full theme settings are not permission-controlled here.
        </div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>General settings</h4>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.settings.chatLanguages)} onChange={(e) => setAccess((prev) => ({ ...prev, settings: { ...prev.settings, chatLanguages: e.target.checked } }))} />Chat languages</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.aiMode)} onChange={(e) => setAccess((prev) => ({ ...prev, aiMode: e.target.checked }))} />AI mode</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.settings.autoTrigger)} onChange={(e) => setAccess((prev) => ({ ...prev, settings: { ...prev.settings, autoTrigger: e.target.checked } }))} />Auto-Trigger Settings</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.settings.escalation)} onChange={(e) => setAccess((prev) => ({ ...prev, settings: { ...prev.settings, escalation: e.target.checked } }))} />Escalation</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.settings.safety)} onChange={(e) => setAccess((prev) => ({ ...prev, settings: { ...prev.settings, safety: e.target.checked } }))} />Safety &amp; Compliance</label></div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Voice settings</h4>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.enableVoiceMode)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, enableVoiceMode: e.target.checked } }))} />Enable voice mode in chatbot</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.enableVoiceResponse)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, enableVoiceResponse: e.target.checked } }))} />Enable voice response (AI speaks replies)</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.ignoreEmoji)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, ignoreEmoji: e.target.checked } }))} />Ignore emojis when speaking</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.spokenLanguage)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, spokenLanguage: e.target.checked } }))} />Spoken language (Text-to-Speech API)</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.presetVoices)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, presetVoices: e.target.checked } }))} />Preset voices</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={Boolean(access.voice.trainCustomVoice)} onChange={(e) => setAccess((prev) => ({ ...prev, voice: { ...prev.voice, trainCustomVoice: e.target.checked } }))} />Train your own voice</label></div>

        <div className="sa-field" style={{ marginTop: 16 }}>
          <label>Allowed preset voices for admin</label>
          <p className="sa-text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Load preset voices from API, then choose exactly which voice(s) admin can access for the selected spoken language.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={setAllPresetVoices} disabled={!access.voice.presetVoices || presetVoiceOptions.length === 0}>
              Allow all preset voices
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-ghost sa-btn-sm"
              disabled={voiceListLoading}
              onClick={async () => {
                try {
                  await loadPresetVoices(spokenLanguageCode);
                } catch (err) {
                  showToast(err.message || 'Failed to reload preset voices', 'error');
                }
              }}
            >
              {voiceListLoading ? 'Reloading...' : 'Reload voices'}
            </button>
          </div>
          <div className="sa-field-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="sa-field" style={{ flex: '1 1 220px', minWidth: 220 }}>
              <label>Spoken language</label>
              <select
                value={spokenLanguageCode}
                onChange={async (e) => {
                  const next = e.target.value;
                  setSpokenLanguageCode(next);
                  try {
                    await loadPresetVoices(next);
                  } catch (err) {
                    showToast(err.message || 'Failed to load voices for selected language', 'error');
                  }
                }}
              >
                {spokenLanguageCatalog.map((opt) => (
                  <option key={opt.code || 'auto'} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 180px', gap: 8, marginBottom: 12 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by voice or type..."
            />
            <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
              <option value="all">All genders</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            <select value={filterProfile} onChange={(e) => setFilterProfile(e.target.value)}>
              <option value="all">All types</option>
              {presetProfileOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {voiceListLoading ? (
            <div className="sa-empty-sm">Loading preset voices...</div>
          ) : filteredPresetVoiceOptions.length === 0 ? (
            <div className="sa-empty-sm">No preset voice options available.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredPresetVoiceOptions.map((row) => (
                <label key={row.key} className="sa-field-check" style={{ opacity: access.voice.presetVoices ? 1 : 0.6 }}>
                  <input
                    type="checkbox"
                    checked={selectedPresetVoiceKeys.includes(row.key)}
                    disabled={!access.voice.presetVoices}
                    onChange={(e) => togglePresetVoice(row.key, e.target.checked)}
                  />
                  <span><strong>{row.voiceName}</strong> — {row.profileLabel} ({row.gender})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
