import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};

export default function VirtualAssistant() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [vaEnabled, setVaEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [avatarId, setAvatarId] = useState('');
  const [avatarName, setAvatarName] = useState('');
  const [contextId, setContextId] = useState('');
  const [contextName, setContextName] = useState('');
  const [voiceSource, setVoiceSource] = useState('liveavatar');
  const [voiceId, setVoiceId] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [sandboxMode, setSandboxMode] = useState(false);
  const [videoQuality, setVideoQuality] = useState('high');

  // Voice settings from existing config (read-only here)
  const [voiceCustomId, setVoiceCustomId] = useState('');
  const [voiceCustomName, setVoiceCustomName] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('professional');
  const [voiceGender, setVoiceGender] = useState('female');
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);

  // LiveAvatar data
  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [credits, setCredits] = useState(null);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [loadingContexts, setLoadingContexts] = useState(false);

  // New context form
  const [showNewContext, setShowNewContext] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [newContextPrompt, setNewContextPrompt] = useState('');
  const [newContextOpening, setNewContextOpening] = useState('');
  const [creatingContext, setCreatingContext] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await authFetch('/virtual-assistant');
      if (!res.ok) throw new Error('Failed to load VA settings');
      const data = await res.json();
      setVaEnabled(data.vaEnabled);
      setApiKeySet(data.liveAvatarApiKeySet);
      setApiKey(data.liveAvatarApiKey || '');
      setAvatarId(data.avatarId || '');
      setAvatarName(data.avatarName || '');
      setContextId(data.contextId || '');
      setContextName(data.contextName || '');
      setVoiceSource(data.voiceSource || 'liveavatar');
      setVoiceId(data.voiceId || '');
      setVoiceName(data.voiceName || '');
      setSandboxMode(data.sandboxMode);
      setVideoQuality(data.videoQuality || 'high');
      setVoiceCustomId(data.voiceCustomId || '');
      setVoiceCustomName(data.voiceCustomName || '');
      setVoiceProfile(data.voiceProfile || 'professional');
      setVoiceGender(data.voiceGender || 'female');
      setHasElevenLabsKey(data.hasElevenLabsKey || false);
    } catch (err) {
      showToast('Failed to load virtual assistant settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const loadAvatars = useCallback(async () => {
    setLoadingAvatars(true);
    try {
      const res = await authFetch('/virtual-assistant/avatars');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load avatars');
      }
      const data = await res.json();
      const pub = Array.isArray(data.publicAvatars) ? data.publicAvatars : (data.publicAvatars?.results || []);
      const usr = Array.isArray(data.userAvatars) ? data.userAvatars : (data.userAvatars?.results || []);
      setAvatars([...pub, ...usr]);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingAvatars(false);
    }
  }, [authFetch, showToast]);

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true);
    try {
      const res = await authFetch('/virtual-assistant/voices');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load voices');
      }
      const data = await res.json();
      setVoices(data.voices || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingVoices(false);
    }
  }, [authFetch, showToast]);

  const loadContexts = useCallback(async () => {
    setLoadingContexts(true);
    try {
      const res = await authFetch('/virtual-assistant/contexts');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load contexts');
      }
      const data = await res.json();
      setContexts(data.contexts || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingContexts(false);
    }
  }, [authFetch, showToast]);

  const loadCredits = useCallback(async () => {
    try {
      const res = await authFetch('/virtual-assistant/credits');
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.credits);
    } catch { /* ignore */ }
  }, [authFetch]);

  // Load LiveAvatar data when API key is set
  useEffect(() => {
    if (apiKeySet) {
      loadAvatars();
      loadVoices();
      loadContexts();
      loadCredits();
    }
  }, [apiKeySet, loadAvatars, loadVoices, loadContexts, loadCredits]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body = {
        vaEnabled,
        avatarId,
        avatarName,
        contextId,
        contextName,
        voiceSource,
        voiceId,
        voiceName,
        sandboxMode,
        videoQuality,
      };
      // Only send API key if user typed a new one (not the masked placeholder)
      if (apiKey && apiKey !== '••••••••') {
        body.liveAvatarApiKey = apiKey;
      }
      const res = await authFetch('/virtual-assistant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      const data = await res.json();
      setApiKeySet(data.liveAvatarApiKeySet);
      setApiKey(data.liveAvatarApiKey || '');
      showToast('Virtual assistant settings saved', 'success');
      // Reload data if key was just set
      if (data.liveAvatarApiKeySet && !apiKeySet) {
        loadAvatars();
        loadVoices();
        loadContexts();
        loadCredits();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [authFetch, showToast, vaEnabled, apiKey, apiKeySet, avatarId, avatarName, contextId, contextName, voiceSource, voiceId, voiceName, sandboxMode, videoQuality, loadAvatars, loadVoices, loadContexts, loadCredits]);

  const handleCreateContext = useCallback(async () => {
    if (!newContextName.trim() || !newContextPrompt.trim()) {
      showToast('Context name and prompt are required', 'error');
      return;
    }
    setCreatingContext(true);
    try {
      const res = await authFetch('/virtual-assistant/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContextName.trim(),
          prompt: newContextPrompt.trim(),
          opening_text: newContextOpening.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create context');
      }
      const data = await res.json();
      const ctx = data.context;
      if (ctx) {
        setContextId(ctx.id);
        setContextName(ctx.name);
      }
      showToast('Context created', 'success');
      setShowNewContext(false);
      setNewContextName('');
      setNewContextPrompt('');
      setNewContextOpening('');
      loadContexts();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreatingContext(false);
    }
  }, [authFetch, showToast, newContextName, newContextPrompt, newContextOpening, loadContexts]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div id="virtual-assistant-top" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0" style={{ fontWeight: 700 }}>Virtual Assistant</h5>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Enable toggle */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body d-flex align-items-center justify-content-between">
          <div>
            <strong>Enable Virtual Assistant</strong>
            <div className="text-muted" style={{ fontSize: 13 }}>
              When enabled, the embed page shows a talking AI avatar above the chat panel.
            </div>
          </div>
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={vaEnabled}
              onChange={(e) => setVaEnabled(e.target.checked)}
            />
          </div>
        </div>
      </div>

      {/* API Key */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body">
          <label className="form-label fw-semibold">LiveAvatar API Key</label>
          <input
            type="password"
            className="form-control form-control-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your LiveAvatar API key"
            autoComplete="off"
          />
          <div className="text-muted mt-1" style={{ fontSize: 12 }}>
            Get your API key from{' '}
            <a href="https://liveavatar.com" target="_blank" rel="noopener noreferrer">liveavatar.com</a>.
            {apiKeySet && <span className="text-success ms-2">Key is configured</span>}
          </div>
        </div>
      </div>

      {/* Sandbox mode */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body d-flex align-items-center justify-content-between">
          <div>
            <strong>Sandbox Mode</strong>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Test with a demo avatar for free (1-minute sessions, no credit usage).
            </div>
          </div>
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.checked)}
            />
          </div>
        </div>
      </div>

      {/* Streaming Quality */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body">
          <label className="form-label fw-semibold">Streaming Quality</label>
          <select
            className="form-select form-select-sm"
            value={videoQuality}
            onChange={(e) => setVideoQuality(e.target.value)}
          >
            <option value="low">Low — faster, lower bandwidth</option>
            <option value="medium">Medium — balanced</option>
            <option value="high">High — best quality</option>
          </select>
          <div className="text-muted mt-1" style={{ fontSize: 12 }}>
            Controls the video stream quality of the avatar. Lower quality uses less bandwidth.
          </div>
        </div>
      </div>

      {/* Credits display */}
      {credits && (
        <div className="card mb-3" style={cardStyle}>
          <div className="card-body d-flex align-items-center justify-content-between">
            <span className="fw-semibold">LiveAvatar Credits</span>
            <span className="badge bg-primary" style={{ fontSize: 14 }}>{credits.credits_left ?? '—'}</span>
          </div>
        </div>
      )}

      {/* Avatar selection */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <label className="form-label fw-semibold mb-0">Select Avatar</label>
            {apiKeySet && (
              <button className="btn btn-outline-secondary btn-sm" onClick={loadAvatars} disabled={loadingAvatars}>
                {loadingAvatars ? 'Loading…' : 'Refresh'}
              </button>
            )}
          </div>
          {!apiKeySet ? (
            <div className="text-muted" style={{ fontSize: 13 }}>Enter API key and save to load avatars.</div>
          ) : loadingAvatars ? (
            <div className="text-center py-3"><div className="spinner-border spinner-border-sm" /></div>
          ) : avatars.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 13 }}>No avatars available.</div>
          ) : (
            <div className="row g-2">
              {avatars.map((av) => {
                const id = av.id || av.avatar_id;
                const name = av.name || av.avatar_name || id;
                const preview = av.preview_url || av.thumbnail_url || '';
                const isSelected = avatarId === id;
                return (
                  <div key={id} className="col-4 col-md-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => { setAvatarId(id); setAvatarName(name); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setAvatarId(id); setAvatarName(name); } }}
                      className="text-center p-2 rounded"
                      style={{
                        border: isSelected ? '2px solid var(--bs-primary)' : '1px solid var(--chat-border)',
                        background: isSelected ? 'rgba(var(--bs-primary-rgb), 0.08)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {preview ? (
                        <img
                          src={preview}
                          alt={name}
                          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: 'var(--chat-border)', margin: '0 auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 24, color: 'var(--chat-text-secondary)',
                          }}
                        >
                          🤖
                        </div>
                      )}
                      <div className="mt-1" style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {avatarId && (
            <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
              Selected: <strong>{avatarName || avatarId}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Voice settings */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body">
          <label className="form-label fw-semibold">Voice Source</label>
          <div className="d-flex gap-3 mb-2">
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="voiceSource"
                id="vs-liveavatar"
                value="liveavatar"
                checked={voiceSource === 'liveavatar'}
                onChange={() => setVoiceSource('liveavatar')}
              />
              <label className="form-check-label" htmlFor="vs-liveavatar">LiveAvatar Default</label>
            </div>
            <div className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name="voiceSource"
                id="vs-elevenlabs"
                value="elevenlabs"
                checked={voiceSource === 'elevenlabs'}
                onChange={() => setVoiceSource('elevenlabs')}
              />
              <label className="form-check-label" htmlFor="vs-elevenlabs">ElevenLabs Voice</label>
            </div>
          </div>

          {voiceSource === 'liveavatar' && (
            <>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <label className="form-label mb-0" style={{ fontSize: 13 }}>Select LiveAvatar Voice</label>
                {apiKeySet && (
                  <button className="btn btn-outline-secondary btn-sm" onClick={loadVoices} disabled={loadingVoices} style={{ fontSize: 12 }}>
                    {loadingVoices ? 'Loading…' : 'Refresh'}
                  </button>
                )}
              </div>
              {!apiKeySet ? (
                <div className="text-muted" style={{ fontSize: 13 }}>Enter API key and save to load voices.</div>
              ) : loadingVoices ? (
                <div className="text-center py-2"><div className="spinner-border spinner-border-sm" /></div>
              ) : (
                <select
                  className="form-select form-select-sm"
                  value={voiceId}
                  onChange={(e) => {
                    const sel = voices.find((v) => (v.id || v.voice_id) === e.target.value);
                    setVoiceId(e.target.value);
                    setVoiceName(sel?.name || sel?.voice_name || '');
                  }}
                >
                  <option value="">Use avatar default voice</option>
                  {voices.map((v) => {
                    const vid = v.id || v.voice_id;
                    const vname = v.name || v.voice_name || vid;
                    return <option key={vid} value={vid}>{vname}</option>;
                  })}
                </select>
              )}
            </>
          )}

          {voiceSource === 'elevenlabs' && (
            <div className="mt-2 p-3 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>ElevenLabs Voice (from Voice Settings)</div>
              {hasElevenLabsKey ? (
                <>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    <strong>Profile:</strong> {voiceProfile} &middot; <strong>Gender:</strong> {voiceGender}
                  </div>
                  {voiceCustomId ? (
                    <div className="mt-1 text-muted" style={{ fontSize: 12 }}>
                      <strong>Custom Voice:</strong> {voiceCustomName || voiceCustomId}
                    </div>
                  ) : (
                    <div className="mt-1 text-muted" style={{ fontSize: 12 }}>
                      Using preset voice ({voiceProfile} / {voiceGender}). Set a custom voice ID in Voice Settings for a specific voice.
                    </div>
                  )}
                  <div className="mt-1 text-success" style={{ fontSize: 12 }}>
                    ✓ ElevenLabs API key configured. Voice will be auto-bound to LiveAvatar.
                  </div>
                </>
              ) : (
                <div className="text-warning" style={{ fontSize: 12 }}>
                  ⚠ No ElevenLabs API key found. Configure it in <strong>Voice Settings</strong> first.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context (personality / prompt) */}
      <div className="card mb-3" style={cardStyle}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <label className="form-label fw-semibold mb-0">Avatar Context (Personality)</label>
            <div className="d-flex gap-2">
              {apiKeySet && (
                <button className="btn btn-outline-secondary btn-sm" onClick={loadContexts} disabled={loadingContexts} style={{ fontSize: 12 }}>
                  {loadingContexts ? 'Loading…' : 'Refresh'}
                </button>
              )}
              {apiKeySet && (
                <button className="btn btn-outline-primary btn-sm" onClick={() => setShowNewContext(!showNewContext)} style={{ fontSize: 12 }}>
                  {showNewContext ? 'Cancel' : '+ New Context'}
                </button>
              )}
            </div>
          </div>

          {!apiKeySet ? (
            <div className="text-muted" style={{ fontSize: 13 }}>Enter API key and save to load contexts.</div>
          ) : loadingContexts ? (
            <div className="text-center py-2"><div className="spinner-border spinner-border-sm" /></div>
          ) : (
            <select
              className="form-select form-select-sm"
              value={contextId}
              onChange={(e) => {
                const sel = contexts.find((c) => c.id === e.target.value);
                setContextId(e.target.value);
                setContextName(sel?.name || '');
              }}
            >
              <option value="">No context</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {contextId && (
            <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
              Selected: <strong>{contextName || contextId}</strong>
            </div>
          )}

          {/* New context form */}
          {showNewContext && (
            <div className="mt-3 p-3 rounded" style={{ background: 'var(--chat-bg)', border: '1px solid var(--chat-border)' }}>
              <h6 style={{ fontSize: 14, fontWeight: 600 }}>Create New Context</h6>
              <div className="mb-2">
                <label className="form-label" style={{ fontSize: 13 }}>Name</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={newContextName}
                  onChange={(e) => setNewContextName(e.target.value)}
                  placeholder="e.g. Sales Assistant"
                />
              </div>
              <div className="mb-2">
                <label className="form-label" style={{ fontSize: 13 }}>Prompt / Personality</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={newContextPrompt}
                  onChange={(e) => setNewContextPrompt(e.target.value)}
                  placeholder="Describe how the avatar should behave…"
                />
              </div>
              <div className="mb-2">
                <label className="form-label" style={{ fontSize: 13 }}>Opening Text (optional)</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={newContextOpening}
                  onChange={(e) => setNewContextOpening(e.target.value)}
                  placeholder="e.g. Hi! How can I help you today?"
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreateContext}
                disabled={creatingContext}
              >
                {creatingContext ? 'Creating…' : 'Create Context'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info footer */}
      <div className="text-muted text-center" style={{ fontSize: 12, padding: '12px 0 24px' }}>
        Powered by <a href="https://liveavatar.com" target="_blank" rel="noopener noreferrer">LiveAvatar</a>.
        Avatar sessions use 2 credits per minute in FULL mode. Sandbox mode is free.
      </div>
    </div>
  );
}
