import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import PasswordInput from '../../components/PasswordInput';

export default function ApiSettings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [aiModel, setAiModel] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState('');
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasElevenlabsKey, setHasElevenlabsKey] = useState(false);
  const [fallbackAnthropicEnv, setFallbackAnthropicEnv] = useState(false);
  const [fallbackGeminiEnv, setFallbackGeminiEnv] = useState(false);
  const [fallbackElevenlabsEnv, setFallbackElevenlabsEnv] = useState(false);

  useEffect(() => {
    authFetch('/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load API settings');
        const d = await res.json();
        setAiProvider(d.ai?.provider || 'anthropic');
        setAiModel(d.ai?.model || '');
        setHasAnthropicKey(Boolean(d.ai?.hasAnthropicKey));
        setHasGeminiKey(Boolean(d.ai?.hasGeminiKey));
        setHasElevenlabsKey(Boolean(d.ai?.hasElevenlabsKey));
        setFallbackAnthropicEnv(Boolean(d.ai?.fallbackAnthropicEnv));
        setFallbackGeminiEnv(Boolean(d.ai?.fallbackGeminiEnv));
        setFallbackElevenlabsEnv(Boolean(d.ai?.fallbackElevenlabsEnv));
        setAnthropicApiKey('');
        setGeminiApiKey('');
        setElevenlabsApiKey('');
      })
      .catch(() => showToast('Failed to load API settings', 'error'))
      .finally(() => setLoading(false));
  }, [authFetch, showToast]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai: {
            provider: aiProvider,
            model: aiModel.trim() || null,
            anthropicApiKey: anthropicApiKey.trim() ? anthropicApiKey.trim() : undefined,
            geminiApiKey: geminiApiKey.trim() ? geminiApiKey.trim() : undefined,
            elevenlabsApiKey: elevenlabsApiKey.trim() ? elevenlabsApiKey.trim() : undefined,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      if (updated?.ai) {
        setAiProvider(updated.ai.provider || aiProvider);
        setAiModel(updated.ai.model || '');
        setHasAnthropicKey(Boolean(updated.ai.hasAnthropicKey));
        setHasGeminiKey(Boolean(updated.ai.hasGeminiKey));
        setHasElevenlabsKey(Boolean(updated.ai.hasElevenlabsKey));
        setFallbackAnthropicEnv(Boolean(updated.ai.fallbackAnthropicEnv));
        setFallbackGeminiEnv(Boolean(updated.ai.fallbackGeminiEnv));
        setFallbackElevenlabsEnv(Boolean(updated.ai.fallbackElevenlabsEnv));
      }
      setAnthropicApiKey('');
      setGeminiApiKey('');
      setElevenlabsApiKey('');
      showToast('API settings saved', 'success');
    } catch {
      showToast('Failed to save API settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>API settings</h5>
      <form onSubmit={handleSave} style={{ maxWidth: 760 }}>
        <div className="mb-3">
          <label className="form-label">AI provider</label>
          <select
            className="form-select"
            value={aiProvider}
            onChange={(e) => setAiProvider(e.target.value)}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label">Model (optional)</label>
          <input
            type="text"
            className="form-control"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder={aiProvider === 'gemini' ? 'gemini-1.5-flash' : 'claude-sonnet-4-20250514'}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            Leave blank to use environment default model for selected provider.
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Anthropic API key (company override)</label>
          <PasswordInput
            className="form-control"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder={hasAnthropicKey ? 'Stored in DB (enter new key to replace)' : 'Enter company Anthropic key'}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            {hasAnthropicKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackAnthropicEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Gemini API key (company override)</label>
          <PasswordInput
            className="form-control"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder={hasGeminiKey ? 'Stored in DB (enter new key to replace)' : 'Enter company Gemini key'}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            {hasGeminiKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackGeminiEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">ElevenLabs API key (company override)</label>
          <PasswordInput
            className="form-control"
            value={elevenlabsApiKey}
            onChange={(e) => setElevenlabsApiKey(e.target.value)}
            placeholder={hasElevenlabsKey ? 'Stored in DB (enter new key to replace)' : 'Enter company ElevenLabs key'}
            style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
          />
          <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
            {hasElevenlabsKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackElevenlabsEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save API settings'}
        </button>
      </form>
    </div>
  );
}
