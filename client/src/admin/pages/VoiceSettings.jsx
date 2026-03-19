import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};

const VOICE_OPTIONS = [
  {
    id: 'female',
    label: 'Female voice',
    description: 'Balanced, friendly tone for general customer conversations.',
  },
  {
    id: 'male',
    label: 'Male voice',
    description: 'Clear, confident tone for professional support and sales calls.',
  },
];

export default function VoiceSettings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceResponseEnabled, setVoiceResponseEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState('female');
  const [voiceIgnoreEmoji, setVoiceIgnoreEmoji] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch('/settings');
        if (!res.ok) throw new Error('Failed to load voice settings');
        const data = await res.json();
        if (cancelled) return;

        setVoiceEnabled(Boolean(data.voice?.enabled));
        setVoiceResponseEnabled(data.voice?.responseEnabled !== false);
        setVoiceGender(data.voice?.gender === 'male' ? 'male' : 'female');
        setVoiceIgnoreEmoji(Boolean(data.voice?.ignoreEmoji));
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
  }, [authFetch, showToast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            enabled: voiceEnabled,
            responseEnabled: voiceResponseEnabled,
            gender: voiceGender,
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
  };

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
          <h6 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Response voice</h6>

          <div className="row g-3">
            {VOICE_OPTIONS.map((option) => (
              <div key={option.id} className="col-12 col-md-6">
                <label
                  htmlFor={`voice-gender-${option.id}`}
                  className="d-block rounded-3 p-3 h-100"
                  style={{
                    border: voiceGender === option.id ? '1px solid var(--chat-accent)' : '1px solid var(--chat-border)',
                    background: voiceGender === option.id ? 'rgba(99, 102, 241, 0.08)' : 'var(--chat-bg)',
                    cursor: 'pointer',
                  }}
                >
                  <div className="form-check mb-2">
                    <input
                      id={`voice-gender-${option.id}`}
                      className="form-check-input"
                      type="radio"
                      name="voice-gender"
                      value={option.id}
                      checked={voiceGender === option.id}
                      onChange={() => setVoiceGender(option.id)}
                      disabled={!voiceEnabled}
                    />
                    <span className="form-check-label" style={{ color: 'var(--chat-text-heading)', fontWeight: 600 }}>
                      {option.label}
                    </span>
                  </div>
                  <div className="small" style={{ color: 'var(--chat-muted)' }}>
                    {option.description}
                  </div>
                </label>
              </div>
            ))}
          </div>

          {!voiceEnabled && (
            <div className="small mt-3" style={{ color: 'var(--chat-muted)' }}>
              Enable voice mode first to apply voice gender selection.
            </div>
          )}
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
