import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

const LIVEAVATAR_SANDBOX_AVATAR_ID = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';

export default function CompanyVirtualAssistant() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vaEnabled, setVaEnabled] = useState(false);
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

  const [voiceCustomId, setVoiceCustomId] = useState('');
  const [voiceCustomName, setVoiceCustomName] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('professional');
  const [voiceGender, setVoiceGender] = useState('female');
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);

  const [avatars, setAvatars] = useState([]);
  const [voices, setVoices] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [credits, setCredits] = useState(null);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [loadingContexts, setLoadingContexts] = useState(false);

  const [showNewContext, setShowNewContext] = useState(false);
  const [newContextName, setNewContextName] = useState('');
  const [newContextPrompt, setNewContextPrompt] = useState('');
  const [newContextOpening, setNewContextOpening] = useState('');
  const [creatingContext, setCreatingContext] = useState(false);

  const base = `/companies/${companyId}/virtual-assistant`;

  const loadSettings = useCallback(async () => {
    try {
      const res = await saFetch(base);
      if (!res.ok) throw new Error('Failed to load VA settings');
      const data = await res.json();
      setVaEnabled(data.vaEnabled);
      setApiKeySet(data.liveAvatarApiKeySet);
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
  }, [saFetch, base, showToast]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const loadAvatars = useCallback(async () => {
    setLoadingAvatars(true);
    try {
      const res = await saFetch(`${base}/avatars?sandbox=${sandboxMode ? 'true' : 'false'}`);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to load avatars'); }
      const data = await res.json();
      const pub = Array.isArray(data.publicAvatars) ? data.publicAvatars : (data.publicAvatars?.results || []);
      const usr = Array.isArray(data.userAvatars) ? data.userAvatars : (data.userAvatars?.results || []);
      setAvatars([...pub, ...usr]);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoadingAvatars(false); }
  }, [saFetch, base, sandboxMode, showToast]);

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true);
    try {
      const res = await saFetch(`${base}/voices`);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to load voices'); }
      const data = await res.json();
      setVoices(data.voices || []);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoadingVoices(false); }
  }, [saFetch, base, showToast]);

  const loadContexts = useCallback(async () => {
    setLoadingContexts(true);
    try {
      const res = await saFetch(`${base}/contexts`);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to load contexts'); }
      const data = await res.json();
      setContexts(data.contexts || []);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoadingContexts(false); }
  }, [saFetch, base, showToast]);

  const loadCredits = useCallback(async () => {
    try {
      const res = await saFetch(`${base}/credits`);
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.credits);
    } catch { /* ignore */ }
  }, [saFetch, base]);

  useEffect(() => {
    if (apiKeySet) { loadAvatars(); loadVoices(); loadContexts(); loadCredits(); }
  }, [apiKeySet, loadAvatars, loadVoices, loadContexts, loadCredits]);

  useEffect(() => {
    if (!sandboxMode) return;
    const sandboxAvatar = avatars.find((a) => (a.id || a.avatar_id) === LIVEAVATAR_SANDBOX_AVATAR_ID);
    if (avatarId === LIVEAVATAR_SANDBOX_AVATAR_ID) return;
    setAvatarId(LIVEAVATAR_SANDBOX_AVATAR_ID);
    setAvatarName(sandboxAvatar?.name || sandboxAvatar?.avatar_name || 'Wayne');
  }, [sandboxMode, avatars, avatarId]);

  const visibleAvatars = sandboxMode
    ? avatars.filter((a) => (a.id || a.avatar_id) === LIVEAVATAR_SANDBOX_AVATAR_ID)
    : avatars;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const body = { vaEnabled, avatarId, avatarName, contextId, contextName, voiceSource, voiceId, voiceName, sandboxMode, videoQuality };
      const res = await saFetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to save'); }
      const data = await res.json();
      setApiKeySet(data.liveAvatarApiKeySet);
      showToast('Virtual assistant settings saved', 'success');
      if (data.liveAvatarApiKeySet && !apiKeySet) { loadAvatars(); loadVoices(); loadContexts(); loadCredits(); }
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }, [saFetch, base, showToast, vaEnabled, apiKeySet, avatarId, avatarName, contextId, contextName, voiceSource, voiceId, voiceName, sandboxMode, videoQuality, loadAvatars, loadVoices, loadContexts, loadCredits]);

  const handleCreateContext = useCallback(async () => {
    if (!newContextName.trim() || !newContextPrompt.trim()) { showToast('Context name and prompt are required', 'error'); return; }
    setCreatingContext(true);
    try {
      const res = await saFetch(`${base}/contexts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newContextName.trim(), prompt: newContextPrompt.trim(), opening_text: newContextOpening.trim() || undefined }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to create context'); }
      const data = await res.json();
      if (data.context) { setContextId(data.context.id); setContextName(data.context.name); }
      showToast('Context created', 'success');
      setShowNewContext(false); setNewContextName(''); setNewContextPrompt(''); setNewContextOpening('');
      loadContexts();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setCreatingContext(false); }
  }, [saFetch, base, showToast, newContextName, newContextPrompt, newContextOpening, loadContexts]);

  if (loading) return <div className="sa-loading">Loading virtual assistant settings…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/configurations`} className="sa-breadcrumb">← Back</Link>
          <h2 className="sa-page-title">Virtual Assistant</h2>
        </div>
        <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <form className="sa-panel" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        {/* Enable toggle */}
        <div className="sa-field-check">
          <label>
            <input type="checkbox" checked={vaEnabled} onChange={(e) => setVaEnabled(e.target.checked)} />
            Enable Virtual Assistant (talking AI avatar on the embed page)
          </label>
        </div>

        {/* API key status */}
        <div className="sa-field" style={{ marginTop: 16 }}>
          <label>LiveAvatar API Key</label>
          <div className="sa-text-muted" style={{ marginTop: 4 }}>
            {apiKeySet
              ? <span style={{ color: 'var(--sa-success, green)' }}>Key is configured. Manage it in API Settings.</span>
              : <span style={{ color: 'var(--sa-warning, orange)' }}>Not configured. Set it in <Link to={`/super-admin/companies/${companyId}/api-settings`}>API Settings</Link>.</span>}
          </div>
        </div>

        {/* Sandbox */}
        <div className="sa-field-check" style={{ marginTop: 16 }}>
          <label>
            <input type="checkbox" checked={sandboxMode} onChange={(e) => setSandboxMode(e.target.checked)} />
            Sandbox Mode (free 1-min demo sessions, Wayne avatar only)
          </label>
        </div>

        {/* Video quality */}
        <div className="sa-field" style={{ marginTop: 16 }}>
          <label>Streaming Quality</label>
          <select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Credits */}
        {credits && (
          <div className="sa-field" style={{ marginTop: 16 }}>
            <label>LiveAvatar Credits</label>
            <div><strong>{credits.credits_left ?? '—'}</strong> remaining</div>
          </div>
        )}

        {/* Avatars */}
        <div className="sa-field" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Select Avatar</label>
            {apiKeySet && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={loadAvatars} disabled={loadingAvatars}>{loadingAvatars ? 'Loading…' : 'Refresh'}</button>}
          </div>
          {!apiKeySet ? (
            <div className="sa-text-muted">Set the LiveAvatar API key in API Settings first.</div>
          ) : loadingAvatars ? (
            <div className="sa-text-muted">Loading avatars…</div>
          ) : visibleAvatars.length === 0 ? (
            <div className="sa-text-muted">No avatars available.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginTop: 8 }}>
              {visibleAvatars.map((av) => {
                const id = av.id || av.avatar_id;
                const name = av.name || av.avatar_name || id;
                const preview = av.preview_url || av.thumbnail_url || '';
                const sel = avatarId === id;
                return (
                  <div key={id} role="button" tabIndex={0} onClick={() => { setAvatarId(id); setAvatarName(name); }} onKeyDown={(e) => { if (e.key === 'Enter') { setAvatarId(id); setAvatarName(name); } }} style={{ textAlign: 'center', padding: 8, borderRadius: 8, border: sel ? '2px solid var(--sa-primary, #3b82f6)' : '1px solid var(--sa-border, #e5e7eb)', cursor: 'pointer' }}>
                    {preview ? <img src={preview} alt={name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e5e7eb', margin: '0 auto', lineHeight: '56px', fontSize: 22 }}>🤖</div>}
                    <div style={{ fontSize: 11, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: sel ? 600 : 400 }}>{name}</div>
                  </div>
                );
              })}
            </div>
          )}
          {avatarId && <div className="sa-text-muted" style={{ marginTop: 6, fontSize: 12 }}>Selected: <strong>{avatarName || avatarId}</strong></div>}
        </div>

        {/* Voice */}
        <div className="sa-field" style={{ marginTop: 20 }}>
          <label>Voice Source</label>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label className="sa-field-check"><input type="radio" name="vs" checked={voiceSource === 'liveavatar'} onChange={() => setVoiceSource('liveavatar')} /> LiveAvatar Default</label>
            <label className="sa-field-check"><input type="radio" name="vs" checked={voiceSource === 'elevenlabs'} onChange={() => setVoiceSource('elevenlabs')} /> ElevenLabs</label>
          </div>
          {voiceSource === 'liveavatar' && apiKeySet && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="sa-text-muted" style={{ fontSize: 12 }}>LiveAvatar Voice</span>
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={loadVoices} disabled={loadingVoices} style={{ fontSize: 11 }}>{loadingVoices ? '…' : 'Refresh'}</button>
              </div>
              <select value={voiceId} onChange={(e) => { const s = voices.find((v) => (v.id || v.voice_id) === e.target.value); setVoiceId(e.target.value); setVoiceName(s?.name || s?.voice_name || ''); }} style={{ marginTop: 4 }}>
                <option value="">Avatar default voice</option>
                {voices.map((v) => { const vid = v.id || v.voice_id; return <option key={vid} value={vid}>{v.name || v.voice_name || vid}</option>; })}
              </select>
            </div>
          )}
          {voiceSource === 'elevenlabs' && (
            <div className="sa-text-muted" style={{ marginTop: 8, fontSize: 12 }}>
              {hasElevenLabsKey
                ? <>Profile: {voiceProfile} · Gender: {voiceGender}{voiceCustomId ? ` · Custom: ${voiceCustomName || voiceCustomId}` : ''}</>
                : 'No ElevenLabs key configured for this company.'}
            </div>
          )}
        </div>

        {/* Context */}
        <div className="sa-field" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>Avatar Context (Personality)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {apiKeySet && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={loadContexts} disabled={loadingContexts}>{loadingContexts ? '…' : 'Refresh'}</button>}
              {apiKeySet && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setShowNewContext(!showNewContext)}>{showNewContext ? 'Cancel' : '+ New'}</button>}
            </div>
          </div>
          {!apiKeySet ? (
            <div className="sa-text-muted">Set API key first.</div>
          ) : loadingContexts ? (
            <div className="sa-text-muted">Loading…</div>
          ) : (
            <select value={contextId} onChange={(e) => { const s = contexts.find((c) => c.id === e.target.value); setContextId(e.target.value); setContextName(s?.name || ''); }}>
              <option value="">No context</option>
              {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {showNewContext && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--sa-border, #e5e7eb)', borderRadius: 8 }}>
              <div className="sa-field"><label>Name</label><input value={newContextName} onChange={(e) => setNewContextName(e.target.value)} placeholder="e.g. Sales Assistant" /></div>
              <div className="sa-field"><label>Prompt</label><textarea rows={3} value={newContextPrompt} onChange={(e) => setNewContextPrompt(e.target.value)} placeholder="Describe how the avatar should behave…" /></div>
              <div className="sa-field"><label>Opening Text</label><input value={newContextOpening} onChange={(e) => setNewContextOpening(e.target.value)} placeholder="e.g. Hi! How can I help you today?" /></div>
              <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={handleCreateContext} disabled={creatingContext}>{creatingContext ? 'Creating…' : 'Create Context'}</button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
