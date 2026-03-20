import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};

const FALLBACK_VOICE_CATALOG = [
  {
    id: 'professional',
    label: 'Professional',
    description: 'Polished, consultative tone for premium service conversations.',
    voices: {
      female: { label: 'Rachel' },
      male: { label: 'Adam' },
    },
  },
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Steady, authoritative delivery for enterprise support and operations.',
    voices: {
      female: { label: 'Elli' },
      male: { label: 'Antoni' },
    },
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Energetic and persuasive style optimized for conversion-focused chats.',
    voices: {
      female: { label: 'Bella' },
      male: { label: 'Josh' },
    },
  },
];

function normalizeCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
    return FALLBACK_VOICE_CATALOG;
  }

  const sanitized = rawCatalog
    .filter((item) => item && item.id && item.label)
    .map((item) => ({
      id: String(item.id),
      label: String(item.label),
      description: item.description ? String(item.description) : '',
      genders: Array.isArray(item.genders)
        ? item.genders.map((g) => String(g).toLowerCase()).filter((g) => g === 'female' || g === 'male')
        : ['female', 'male'],
      voices: {
        female: {
          label: item?.voices?.female?.label ? String(item.voices.female.label) : 'Female voice',
        },
        male: {
          label: item?.voices?.male?.label ? String(item.voices.male.label) : 'Male voice',
        },
      },
    }));

  return sanitized.length ? sanitized : FALLBACK_VOICE_CATALOG;
}

export default function VoiceSettings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const previewAudioRef = useRef(null);
  const customSamplesInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoadingKey, setPreviewLoadingKey] = useState(null);
  const [playingPreviewKey, setPlayingPreviewKey] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceResponseEnabled, setVoiceResponseEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState('female');
  const [voiceProfile, setVoiceProfile] = useState('professional');
  const [voiceIgnoreEmoji, setVoiceIgnoreEmoji] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState(FALLBACK_VOICE_CATALOG);
  const [voiceList, setVoiceList] = useState([]);
  const [filterGender, setFilterGender] = useState('all');
  const [filterProfile, setFilterProfile] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceListLoading, setVoiceListLoading] = useState(false);
  const [trainingCustomVoice, setTrainingCustomVoice] = useState(false);
  const [customVoiceName, setCustomVoiceName] = useState('');
  const [customVoiceGender, setCustomVoiceGender] = useState('');
  const [customVoiceSamples, setCustomVoiceSamples] = useState([]);

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

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  const loadSettings = useCallback(async () => {
    const res = await authFetch('/settings');
    if (!res.ok) throw new Error('Failed to load voice settings');

    const data = await res.json();
    const catalog = normalizeCatalog(data.voice?.catalog);
    setVoiceCatalog(catalog);

    const customInfo = data.voice?.custom || null;
    if (customInfo?.available) {
      setCustomVoiceName(String(customInfo.name || ''));
      setCustomVoiceGender(customInfo.gender === 'male' ? 'male' : 'female');
    } else {
      setCustomVoiceName('');
      setCustomVoiceGender('');
    }

    setVoiceEnabled(Boolean(data.voice?.enabled));
    setVoiceResponseEnabled(data.voice?.responseEnabled !== false);
    setVoiceGender(data.voice?.gender === 'male' ? 'male' : 'female');
    const profileIds = new Set(catalog.map((profile) => profile.id));
    const requestedProfile = String(data.voice?.profile || 'professional');
    setVoiceProfile(profileIds.has(requestedProfile) ? requestedProfile : catalog[0].id);
    setVoiceIgnoreEmoji(Boolean(data.voice?.ignoreEmoji));
  }, [authFetch]);

  const loadVoiceList = useCallback(async () => {
    setVoiceListLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterGender && filterGender !== 'all') params.set('gender', filterGender);
      if (filterProfile && filterProfile !== 'all') params.set('profile', filterProfile);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const res = await authFetch(`/settings/voices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVoiceList(data.voices || []);
      } else {
        setVoiceList([]);
      }
    } catch {
      setVoiceList([]);
    } finally {
      setVoiceListLoading(false);
    }
  }, [authFetch, filterGender, filterProfile, searchQuery]);

  useEffect(() => {
    loadVoiceList();
  }, [loadVoiceList]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadSettings();
      } catch {
        if (!cancelled) {
          showToast('Failed to load voice settings', 'error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadSettings, showToast]);

  const selectedVoiceKey = `${voiceProfile}:${voiceGender}`;

  const hasCustomVoice = useMemo(
    () => voiceCatalog.some((profile) => profile.id === 'custom'),
    [voiceCatalog]
  );

  const profileFilterOptions = useMemo(
    () => [{ id: 'all', label: 'All types' }, ...voiceCatalog.map((profile) => ({ id: profile.id, label: profile.label }))],
    [voiceCatalog]
  );

  useEffect(() => {
    if (filterProfile === 'all') return;
    if (!profileFilterOptions.some((item) => item.id === filterProfile)) {
      setFilterProfile('all');
    }
  }, [filterProfile, profileFilterOptions]);

  const selectedVoiceMeta = useMemo(() => {
    const selectedProfile = voiceCatalog.find((profile) => profile.id === voiceProfile) || voiceCatalog[0] || FALLBACK_VOICE_CATALOG[0];
    const selectedVoice = selectedProfile?.voices?.[voiceGender] || null;
    return {
      profileLabel: selectedProfile?.label || 'Professional',
      voiceName: selectedVoice?.label || (voiceGender === 'male' ? 'Male voice' : 'Female voice'),
    };
  }, [voiceCatalog, voiceProfile, voiceGender]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      stopPreview();

      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            enabled: voiceEnabled,
            responseEnabled: voiceResponseEnabled,
            gender: voiceGender,
            profile: voiceProfile,
            ignoreEmoji: voiceIgnoreEmoji,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      showToast('Voice settings saved', 'success');
    } catch {
      showToast('Failed to save voice settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [authFetch, showToast, stopPreview, voiceEnabled, voiceResponseEnabled, voiceGender, voiceProfile, voiceIgnoreEmoji]);

  const handleChooseVoice = useCallback((profileId, gender) => {
    setVoiceProfile(profileId);
    setVoiceGender(gender);
  }, []);

  const handlePreviewVoice = useCallback(async (profileId, gender) => {
    const voiceKey = `${profileId}:${gender}`;

    if (voiceKey === playingPreviewKey) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewLoadingKey(voiceKey);

    try {
      const res = await authFetch('/settings/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: profileId, gender }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 402) {
        showToast(data?.error || 'Voice synthesis quota may be exceeded or a plan upgrade is required. Check your provider account.', 'error');
        return;
      }

      if (!res.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Voice preview is unavailable right now');
      }

      const audio = new Audio(data.audioDataUrl);
      previewAudioRef.current = audio;

      const clearPlayback = () => {
        if (previewAudioRef.current === audio) {
          previewAudioRef.current = null;
        }
        setPlayingPreviewKey(null);
      };

      audio.onended = clearPlayback;
      audio.onerror = clearPlayback;

      await audio.play();
      setPlayingPreviewKey(voiceKey);

      setVoiceProfile(profileId);
      setVoiceGender(gender);
    } catch (err) {
      showToast(err?.message || 'Voice preview failed', 'error');
    } finally {
      setPreviewLoadingKey((prev) => (prev === voiceKey ? null : prev));
    }
  }, [authFetch, playingPreviewKey, showToast, stopPreview]);

  const handleTrainCustomVoice = useCallback(async (event) => {
    event.preventDefault();

    const trimmedName = customVoiceName.trim();
    if (!trimmedName) {
      showToast('Enter a voice name before training.', 'error');
      return;
    }

    if (customVoiceGender !== 'male' && customVoiceGender !== 'female') {
      showToast('Please choose male or female before adding your own voice.', 'error');
      return;
    }

    if (!customVoiceSamples.length) {
      showToast('Upload at least one audio sample to train your voice.', 'error');
      return;
    }

    setTrainingCustomVoice(true);

    try {
      const formData = new FormData();
      formData.append('name', trimmedName);
      formData.append('gender', customVoiceGender);
      customVoiceSamples.forEach((file) => {
        formData.append('samples', file);
      });

      const res = await authFetch('/settings/voice-train', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 402) {
        showToast(data?.error || 'Voice synthesis quota may be exceeded or a plan upgrade is required. Check your provider account.', 'error');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to train custom voice');
      }

      setCustomVoiceSamples([]);
      if (customSamplesInputRef.current) {
        customSamplesInputRef.current.value = '';
      }

      await loadSettings();
      await loadVoiceList();

      setVoiceProfile('custom');
      setVoiceGender(customVoiceGender);

      showToast('Custom voice trained successfully. Testing your voice now...', 'success');
      await handlePreviewVoice('custom', customVoiceGender);
    } catch (err) {
      showToast(err?.message || 'Failed to train custom voice', 'error');
    } finally {
      setTrainingCustomVoice(false);
    }
  }, [authFetch, customVoiceGender, customVoiceName, customVoiceSamples, handlePreviewVoice, loadSettings, loadVoiceList, showToast]);

  if (loading) {
    return (
      <div className="p-4 d-flex align-items-center justify-content-center" style={{ minHeight: 220 }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Voice settings</h5>

      <form onSubmit={handleSubmit}>
        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="voice-enabled-toggle"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="voice-enabled-toggle" style={{ color: 'var(--chat-text-heading)' }}>
              Enable voice mode in chatbot
            </label>
          </div>

          <p className="small mb-0" style={{ color: 'var(--chat-muted)' }}>
            When enabled, visitors can use microphone input and receive spoken AI responses.
          </p>

          <div className="form-check form-switch mt-3 pt-3" style={{ borderTop: '1px solid var(--chat-border)' }}>
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="voice-response-enabled"
              checked={voiceResponseEnabled}
              onChange={(e) => setVoiceResponseEnabled(e.target.checked)}
              disabled={!voiceEnabled}
            />
            <label className="form-check-label" htmlFor="voice-response-enabled" style={{ color: 'var(--chat-text-heading)' }}>
              Enable voice response (AI speaks replies)
            </label>
          </div>
          <p className="small mb-0 mt-1" style={{ color: 'var(--chat-muted)' }}>
            When off, the AI will not speak replies; visitors can still type and use the mic if voice mode is on.
          </p>

          <div className="form-check form-switch mt-3 pt-3" style={{ borderTop: '1px solid var(--chat-border)' }}>
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="voice-ignore-emoji"
              checked={voiceIgnoreEmoji}
              onChange={(e) => setVoiceIgnoreEmoji(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="voice-ignore-emoji" style={{ color: 'var(--chat-text-heading)' }}>
              Ignore emojis when speaking
            </label>
          </div>
          <p className="small mb-0 mt-1" style={{ color: 'var(--chat-muted)' }}>
            When enabled, emojis are removed from the text before it is sent to voice (TTS). Response in chat still shows emojis.
          </p>
        </div>

        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <h6 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>Train your own voice</h6>
          <p className="small mb-3" style={{ color: 'var(--chat-muted)' }}>
            Upload your voice samples, choose male or female before training, then test and select your own voice.
          </p>

          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label small mb-1" style={{ color: 'var(--chat-text-heading)' }}>Voice name</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. My Sales Voice"
                value={customVoiceName}
                onChange={(e) => setCustomVoiceName(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small mb-1" style={{ color: 'var(--chat-text-heading)' }}>
                Gender (required before training)
              </label>
              <div className="d-flex gap-3 pt-1">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="custom-voice-gender"
                    id="custom-voice-gender-female"
                    checked={customVoiceGender === 'female'}
                    onChange={() => setCustomVoiceGender('female')}
                  />
                  <label className="form-check-label" htmlFor="custom-voice-gender-female" style={{ color: 'var(--chat-text)' }}>
                    Female
                  </label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="custom-voice-gender"
                    id="custom-voice-gender-male"
                    checked={customVoiceGender === 'male'}
                    onChange={() => setCustomVoiceGender('male')}
                  />
                  <label className="form-check-label" htmlFor="custom-voice-gender-male" style={{ color: 'var(--chat-text)' }}>
                    Male
                  </label>
                </div>
              </div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small mb-1" style={{ color: 'var(--chat-text-heading)' }}>
                Voice samples (audio)
              </label>
              <input
                ref={customSamplesInputRef}
                type="file"
                className="form-control"
                accept="audio/*"
                multiple
                onChange={(e) => setCustomVoiceSamples(Array.from(e.target.files || []))}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={handleTrainCustomVoice}
              disabled={trainingCustomVoice}
            >
              {trainingCustomVoice ? 'Training...' : 'Train my voice'}
            </button>

            {hasCustomVoice && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => handlePreviewVoice('custom', customVoiceGender || voiceGender)}
              >
                Test my voice
              </button>
            )}
          </div>

          <div className="small mt-2" style={{ color: 'var(--chat-muted)' }}>
            Tip: upload 3 to 8 clear clips (10 to 30 seconds each) for best custom voice quality.
          </div>
        </div>

        <div className="p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <h6 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>Preset voices</h6>
          <p className="small mb-3" style={{ color: 'var(--chat-muted)' }}>
            Search and filter by gender or voice type, then use Hear voice to preview and Choose to select.
          </p>

          <div className="row g-2 mb-3">
            <div className="col-12 col-md-4">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search by voice or type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={filterGender}
                onChange={(e) => setFilterGender(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              >
                <option value="all">All genders</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={filterProfile}
                onChange={(e) => setFilterProfile(e.target.value)}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              >
                {profileFilterOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0" style={{ color: 'var(--chat-text)' }}>
              <thead style={{ borderColor: 'var(--chat-border)', color: 'var(--chat-text-heading)' }}>
                <tr>
                  <th>Voice name</th>
                  <th>Gender</th>
                  <th>Voice type</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderColor: 'var(--chat-border)' }}>
                {voiceListLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-3 text-muted">Loading...</td>
                  </tr>
                ) : voiceList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-3 text-muted">No voices match the filters.</td>
                  </tr>
                ) : (
                  voiceList.map((row) => {
                    const rowKey = `${row.profileId}:${row.gender}`;
                    const isSelected = selectedVoiceKey === rowKey;
                    const isLoadingPreview = previewLoadingKey === rowKey;
                    const isPlayingPreview = playingPreviewKey === rowKey;
                    return (
                      <tr key={rowKey} style={isSelected ? { background: 'rgba(59, 130, 246, 0.08)' } : undefined}>
                        <td style={{ fontWeight: 600 }}>{row.voiceName}</td>
                        <td style={{ textTransform: 'capitalize' }}>{row.gender}</td>
                        <td>{row.profileLabel}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            className={`btn btn-sm me-1 ${isPlayingPreview ? 'btn-outline-danger' : 'btn-outline-primary'}`}
                            onClick={() => handlePreviewVoice(row.profileId, row.gender)}
                            disabled={isLoadingPreview}
                          >
                            {isLoadingPreview ? '...' : (isPlayingPreview ? 'Stop' : 'Hear voice')}
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => handleChooseVoice(row.profileId, row.gender)}
                          >
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

          <div className="small mt-3" style={{ color: 'var(--chat-muted)' }}>
            Selected: {selectedVoiceMeta.profileLabel} — {voiceGender === 'male' ? 'Male' : 'Female'} ({selectedVoiceMeta.voiceName})
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save voice settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
