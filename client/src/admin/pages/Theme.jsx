import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';

const DEFAULT_HEADER_SHADOW = '0 4px 12px rgba(224, 47, 58, 0.25)';

export default function Theme() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const [primaryColor, setPrimaryColor] = useState('#E02F3A');
  const [primaryDarkColor, setPrimaryDarkColor] = useState('#B02530');
  const [secondaryColor, setSecondaryColor] = useState('#000000');
  const [secondaryLightColor, setSecondaryLightColor] = useState('#1A1A1A');
  const [headerBackground, setHeaderBackground] = useState('#000000');
  const [headerShadow, setHeaderShadow] = useState(DEFAULT_HEADER_SHADOW);
  const [headerTextColor, setHeaderTextColor] = useState('#FFFFFF');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/theme')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load theme');
        const data = await res.json();
        const t = data.theme || {};
        setPrimaryColor(t.primaryColor || '#E02F3A');
        setPrimaryDarkColor(t.primaryDarkColor || '#B02530');
        setSecondaryColor(t.secondaryColor || '#000000');
        setSecondaryLightColor(t.secondaryLightColor || '#1A1A1A');
        setHeaderBackground(t.headerBackground || '#000000');
        setHeaderShadow(t.headerShadow || DEFAULT_HEADER_SHADOW);
        setHeaderTextColor(t.headerTextColor || '#FFFFFF');
      })
      .catch(() => showToast('Failed to load theme', 'error'))
      .finally(() => setLoading(false));
  }, [authFetch, showToast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authFetch('/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: {
            primaryColor,
            primaryDarkColor,
            secondaryColor,
            secondaryLightColor,
            headerBackground: headerBackground.trim() || undefined,
            headerShadow: headerShadow.trim() || undefined,
            headerTextColor,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Theme saved', 'success');
    } catch {
      showToast('Failed to save theme', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setPrimaryColor('#E02F3A');
    setPrimaryDarkColor('#B02530');
    setSecondaryColor('#000000');
    setSecondaryLightColor('#1A1A1A');
    setHeaderBackground('#000000');
    setHeaderShadow(DEFAULT_HEADER_SHADOW);
    setHeaderTextColor('#FFFFFF');
    showToast('Defaults restored (save to apply)', 'info');
  };

  if (loading) {
    return (
      <div className="p-4 d-flex align-items-center justify-content-center" style={{ minHeight: 200 }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="p-4" id="theme-top">
      <h5 className="mb-4" style={{ color: 'var(--chat-text-heading)' }}>Theme</h5>
      <p className="text-muted small mb-2" style={{ color: 'var(--chat-muted)' }}>
        Control the chatbot header, colors, and accent shown to visitors. Changes apply to the main chat and embed widget.
      </p>
      <p className="small mb-4">
        <Link to="/admin/settings#company-name" className="link-primary">
          Edit company name, chatbot name, icon, and greeting
        </Link>{' '}
        <span style={{ color: 'var(--chat-muted)' }}>(Settings)</span>
      </p>
      <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
        <div className="card mb-4" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
          <div className="card-header py-2" style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)', borderColor: 'var(--chat-border)' }}>
            Header
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label small">Header background</label>
                <input
                  type="color"
                  className="form-control form-control-color d-block"
                  value={headerBackground}
                  onChange={(e) => setHeaderBackground(e.target.value)}
                  title={headerBackground}
                />
                <input
                  type="text"
                  className="form-control form-control-sm mt-1"
                  value={headerBackground}
                  onChange={(e) => setHeaderBackground(e.target.value)}
                  placeholder="#000000"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small">Header text color</label>
                <input
                  type="color"
                  className="form-control form-control-color d-block"
                  value={headerTextColor}
                  onChange={(e) => setHeaderTextColor(e.target.value)}
                  title={headerTextColor}
                />
                <input
                  type="text"
                  className="form-control form-control-sm mt-1"
                  value={headerTextColor}
                  onChange={(e) => setHeaderTextColor(e.target.value)}
                  placeholder="#FFFFFF"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Header shadow (CSS box-shadow)</label>
                <input
                  type="text"
                  className="form-control"
                  value={headerShadow}
                  onChange={(e) => setHeaderShadow(e.target.value)}
                  placeholder="0 4px 12px rgba(224, 47, 58, 0.25)"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
                <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                  Optional. Example: 0 4px 12px rgba(224, 47, 58, 0.25) for a soft glow under the header.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card mb-4" style={{ background: 'var(--chat-surface)', borderColor: 'var(--chat-border)' }}>
          <div className="card-header py-2" style={{ background: 'var(--chat-sidebar)', color: 'var(--chat-text-heading)', borderColor: 'var(--chat-border)' }}>
            Theme colors
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-sm-6">
                <label className="form-label small">Primary (accent / user bubble)</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small">Primary dark shade</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={primaryDarkColor}
                  onChange={(e) => setPrimaryDarkColor(e.target.value)}
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small">Secondary</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
              </div>
              <div className="col-sm-6">
                <label className="form-label small">Secondary light shade</label>
                <input
                  type="color"
                  className="form-control form-control-color"
                  value={secondaryLightColor}
                  onChange={(e) => setSecondaryLightColor(e.target.value)}
                />
              </div>
            </div>
            <div className="form-text mt-2" style={{ color: 'var(--chat-muted)' }}>
              Primary is used for buttons, user messages, and accents. Secondary affects sidebar and backgrounds when no header overrides are set.
            </div>
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save theme'}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={handleResetDefaults}>
            Reset to default
          </button>
        </div>
      </form>
    </div>
  );
}
