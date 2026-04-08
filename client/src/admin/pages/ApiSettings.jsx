import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import PasswordInput from '../../components/PasswordInput';

const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude AI models for chat completions',
    keyField: 'anthropicApiKey',
    hasKeyField: 'hasAnthropicKey',
    fallbackField: 'fallbackAnthropicEnv',
    modelPlaceholder: 'claude-sonnet-4-20250514',
    category: 'ai',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini AI models for chat completions',
    keyField: 'geminiApiKey',
    hasKeyField: 'hasGeminiKey',
    fallbackField: 'fallbackGeminiEnv',
    modelPlaceholder: 'gemini-1.5-flash',
    category: 'ai',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'Text-to-speech voice synthesis',
    keyField: 'elevenlabsApiKey',
    hasKeyField: 'hasElevenlabsKey',
    fallbackField: 'fallbackElevenlabsEnv',
    category: 'voice',
  },
];

const inputStyle = { background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' };

function StatusBadge({ hasKey, hasFallback }) {
  if (hasKey) return <span className="badge bg-success">Key configured</span>;
  if (hasFallback) return <span className="badge bg-warning text-dark">Using .env fallback</span>;
  return <span className="badge bg-secondary">Not configured</span>;
}

export default function ApiSettings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [aiModel, setAiModel] = useState('');

  const [keyStatus, setKeyStatus] = useState({
    hasAnthropicKey: false,
    hasGeminiKey: false,
    hasElevenlabsKey: false,
    fallbackAnthropicEnv: false,
    fallbackGeminiEnv: false,
    fallbackElevenlabsEnv: false,
  });

  // Modal state
  const [openModal, setOpenModal] = useState(null); // provider id or null
  const [modalKey, setModalKey] = useState('');
  const [modalModel, setModalModel] = useState('');

  useEffect(() => {
    authFetch('/settings')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load API settings');
        const d = await res.json();
        setAiProvider(d.ai?.provider || 'anthropic');
        setAiModel(d.ai?.model || '');
        setKeyStatus({
          hasAnthropicKey: Boolean(d.ai?.hasAnthropicKey),
          hasGeminiKey: Boolean(d.ai?.hasGeminiKey),
          hasElevenlabsKey: Boolean(d.ai?.hasElevenlabsKey),
          fallbackAnthropicEnv: Boolean(d.ai?.fallbackAnthropicEnv),
          fallbackGeminiEnv: Boolean(d.ai?.fallbackGeminiEnv),
          fallbackElevenlabsEnv: Boolean(d.ai?.fallbackElevenlabsEnv),
        });
      })
      .catch(() => showToast('Failed to load API settings', 'error'))
      .finally(() => setLoading(false));
  }, [authFetch, showToast]);

  const openProviderModal = (providerId) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    setModalKey('');
    setModalModel(provider?.category === 'ai' && aiProvider === providerId ? aiModel : '');
    setOpenModal(providerId);
  };

  const closeModal = () => {
    if (saving) return;
    setOpenModal(null);
    setModalKey('');
    setModalModel('');
  };

  const handleModalSave = async () => {
    const provider = PROVIDERS.find((p) => p.id === openModal);
    if (!provider) return;
    setSaving(true);
    try {
      const payload = { ai: {} };

      // For AI providers, also save provider selection & model
      if (provider.category === 'ai') {
        payload.ai.provider = openModal;
        payload.ai.model = modalModel.trim() || null;
      }

      // Set the key for this provider if entered
      if (modalKey.trim()) {
        payload.ai[provider.keyField] = modalKey.trim();
      }

      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      if (updated?.ai) {
        setAiProvider(updated.ai.provider || aiProvider);
        setAiModel(updated.ai.model || '');
        setKeyStatus({
          hasAnthropicKey: Boolean(updated.ai.hasAnthropicKey),
          hasGeminiKey: Boolean(updated.ai.hasGeminiKey),
          hasElevenlabsKey: Boolean(updated.ai.hasElevenlabsKey),
          fallbackAnthropicEnv: Boolean(updated.ai.fallbackAnthropicEnv),
          fallbackGeminiEnv: Boolean(updated.ai.fallbackGeminiEnv),
          fallbackElevenlabsEnv: Boolean(updated.ai.fallbackElevenlabsEnv),
        });
      }
      showToast(`${provider.label} settings saved`, 'success');
      closeModal();
    } catch {
      showToast(`Failed to save ${provider.label} settings`, 'error');
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

  const activeProvider = PROVIDERS.find((p) => p.id === openModal);

  return (
    <div className="p-4">
      <h5 className="mb-2" style={{ color: 'var(--chat-text-heading)' }}>API settings</h5>
      <p className="mb-4" style={{ color: 'var(--chat-muted)' }}>
        Active AI provider: <strong style={{ color: 'var(--chat-text)' }}>{aiProvider === 'gemini' ? 'Google Gemini' : 'Anthropic'}</strong>
        {aiModel ? <> &middot; Model: <strong style={{ color: 'var(--chat-text)' }}>{aiModel}</strong></> : null}
      </p>

      <div className="row g-3" style={{ maxWidth: 900 }}>
        {PROVIDERS.map((provider) => {
          const hasKey = keyStatus[provider.hasKeyField];
          const hasFallback = keyStatus[provider.fallbackField];
          const isActive = provider.category === 'ai' && aiProvider === provider.id;

          return (
            <div className="col-12 col-md-4" key={provider.id}>
              <div
                className="card h-100"
                style={{
                  background: 'var(--chat-surface)',
                  borderColor: isActive ? 'var(--bs-primary, #0d6efd)' : 'var(--chat-border)',
                  borderWidth: isActive ? 2 : 1,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onClick={() => openProviderModal(provider.id)}
              >
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="card-title mb-0" style={{ color: 'var(--chat-text-heading)' }}>{provider.label}</h6>
                    {isActive && <span className="badge bg-primary">Active</span>}
                  </div>
                  <p className="card-text small flex-grow-1" style={{ color: 'var(--chat-muted)' }}>{provider.description}</p>
                  <div className="mt-2">
                    <StatusBadge hasKey={hasKey} hasFallback={hasFallback} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Provider-specific modal */}
      {openModal && activeProvider && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} aria-modal="true" role="dialog" onClick={closeModal}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
              <div className="modal-header" style={{ borderColor: 'var(--chat-border)' }}>
                <h6 className="modal-title" style={{ color: 'var(--chat-text-heading)' }}>{activeProvider.label} settings</h6>
                <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} disabled={saving} />
              </div>
              <div className="modal-body">
                {/* AI provider: show model field */}
                {activeProvider.category === 'ai' && (
                  <div className="mb-3">
                    <label className="form-label">Model (optional)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={modalModel}
                      onChange={(e) => setModalModel(e.target.value)}
                      placeholder={activeProvider.modelPlaceholder}
                      style={inputStyle}
                    />
                    <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                      Leave blank to use the environment default model.
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">{activeProvider.label} API key</label>
                  <PasswordInput
                    className="form-control"
                    value={modalKey}
                    onChange={(e) => setModalKey(e.target.value)}
                    placeholder={keyStatus[activeProvider.hasKeyField] ? 'Stored in DB (enter new key to replace)' : `Enter ${activeProvider.label} API key`}
                    style={inputStyle}
                  />
                  <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                    {keyStatus[activeProvider.hasKeyField] ? 'Company DB key exists.' : 'No company DB key.'}{' '}
                    {keyStatus[activeProvider.fallbackField] ? 'Fallback .env key is available.' : 'No .env fallback key.'}
                  </div>
                </div>

                {activeProvider.category === 'ai' && aiProvider !== activeProvider.id && (
                  <div className="alert alert-info py-2 small mb-0">
                    Saving will switch the active AI provider to <strong>{activeProvider.label}</strong>.
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ borderColor: 'var(--chat-border)' }}>
                <button type="button" className="btn btn-outline-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={handleModalSave}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
