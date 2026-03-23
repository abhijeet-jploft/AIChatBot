import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

export default function CompanyApiSettings() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();

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
    saFetch(`/companies/${companyId}/settings`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load API settings');
        setAiProvider(d.ai?.provider || 'anthropic');
        setAiModel(d.ai?.model || '');
        setHasAnthropicKey(Boolean(d.ai?.hasAnthropicKey));
        setHasGeminiKey(Boolean(d.ai?.hasGeminiKey));
        setHasElevenlabsKey(Boolean(d.ai?.hasElevenlabsKey));
        setFallbackAnthropicEnv(Boolean(d.ai?.fallbackAnthropicEnv));
        setFallbackGeminiEnv(Boolean(d.ai?.fallbackGeminiEnv));
        setFallbackElevenlabsEnv(Boolean(d.ai?.fallbackElevenlabsEnv));
      })
      .catch((err) => showToast(err.message || 'Failed to load API settings', 'error'))
      .finally(() => setLoading(false));
  }, [saFetch, companyId, showToast]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`, {
        method: 'PATCH',
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
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Save failed');
      setHasAnthropicKey(Boolean(updated.ai?.hasAnthropicKey));
      setHasGeminiKey(Boolean(updated.ai?.hasGeminiKey));
      setHasElevenlabsKey(Boolean(updated.ai?.hasElevenlabsKey));
      setFallbackAnthropicEnv(Boolean(updated.ai?.fallbackAnthropicEnv));
      setFallbackGeminiEnv(Boolean(updated.ai?.fallbackGeminiEnv));
      setFallbackElevenlabsEnv(Boolean(updated.ai?.fallbackElevenlabsEnv));
      setAnthropicApiKey('');
      setGeminiApiKey('');
      setElevenlabsApiKey('');
      showToast('API settings saved', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to save API settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading API settings…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}/settings`} className="sa-breadcrumb">← Company Settings</Link>
          <h2 className="sa-page-title">Company API Settings</h2>
        </div>
      </div>
      <form className="sa-panel" onSubmit={handleSave}>
        <div className="sa-field">
          <label>AI provider</label>
          <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div className="sa-field">
          <label>Model (optional)</label>
          <input
            type="text"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder={aiProvider === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-4-20250514'}
          />
        </div>
        <div className="sa-field">
          <label>Anthropic API key (company override)</label>
          <input
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder={hasAnthropicKey ? 'Stored in DB (enter new key to replace)' : 'Enter company Anthropic key'}
          />
          <div className="sa-text-muted">{hasAnthropicKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackAnthropicEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}</div>
        </div>
        <div className="sa-field">
          <label>Gemini API key (company override)</label>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder={hasGeminiKey ? 'Stored in DB (enter new key to replace)' : 'Enter company Gemini key'}
          />
          <div className="sa-text-muted">{hasGeminiKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackGeminiEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}</div>
        </div>
        <div className="sa-field">
          <label>ElevenLabs API key (company override)</label>
          <input
            type="password"
            value={elevenlabsApiKey}
            onChange={(e) => setElevenlabsApiKey(e.target.value)}
            placeholder={hasElevenlabsKey ? 'Stored in DB (enter new key to replace)' : 'Enter company ElevenLabs key'}
          />
          <div className="sa-text-muted">{hasElevenlabsKey ? 'Company DB key exists.' : 'No company DB key.'} {fallbackElevenlabsEnv ? 'Fallback .env key is available.' : 'No .env fallback key.'}</div>
        </div>
        <div className="sa-field-actions">
          <button type="submit" className="sa-btn sa-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save API settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
