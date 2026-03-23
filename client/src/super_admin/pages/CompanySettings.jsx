import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSuperAuth } from '../context/AuthContext';
import { useSuperToast } from '../context/ToastContext';

function defaultAutoTrigger() {
  return {
    openMode: 'auto',
    afterSeconds: 8,
    afterScrollPercent: 40,
    onlySelectedPages: false,
    onPricingPage: false,
    onPortfolioPage: false,
    selectedPages: '',
  };
}

function defaultEscalation() {
  return {
    triggers: {
      userRequestsHuman: true,
      aiConfidenceLow: false,
      urgentKeywords: true,
      angrySentiment: true,
      highValueLead: false,
    },
    actions: {
      instantNotification: true,
      autoScheduleMeeting: false,
      chatTakeoverAlert: true,
    },
    highValueLeadScoreThreshold: 75,
  };
}

function defaultSafety() {
  return {
    blockTopicsEnabled: false,
    blockTopics: '',
    preventInternalData: true,
    restrictDatabasePriceExposure: true,
    disableCompetitorComparisons: false,
    restrictFileSharing: false,
  };
}

export default function CompanySettings() {
  const { companyId } = useParams();
  const { saFetch } = useSuperAuth();
  const { showToast } = useSuperToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);

  const [companyName, setCompanyName] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [widgetPosition, setWidgetPosition] = useState('right');
  const [leadEmailNotificationsEnabled, setLeadEmailNotificationsEnabled] = useState(false);
  const [leadNotificationEmail, setLeadNotificationEmail] = useState('');
  const [autoTrigger, setAutoTrigger] = useState(defaultAutoTrigger());
  const [escalation, setEscalation] = useState(defaultEscalation());
  const [safety, setSafety] = useState(defaultSafety());

  const load = async () => {
    setLoading(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load settings');
      setData(d);
      setCompanyName(d.companyName || d.name || '');
      setChatbotName(d.chatbotName || '');
      setIconUrl(d.iconUrl || '');
      setGreetingMessage(d.greetingMessage || '');
      setWidgetPosition(d.widget?.position === 'left' ? 'left' : 'right');
      setLeadEmailNotificationsEnabled(Boolean(d.leadNotifications?.emailEnabled));
      setLeadNotificationEmail(d.leadNotifications?.email || '');
      setAutoTrigger((prev) => ({ ...prev, ...(d.autoTrigger || {}) }));
      if (d.escalation) {
        setEscalation((prev) => ({
          triggers: { ...prev.triggers, ...d.escalation.triggers },
          actions: { ...prev.actions, ...d.escalation.actions },
          highValueLeadScoreThreshold: d.escalation.highValueLeadScoreThreshold ?? prev.highValueLeadScoreThreshold,
        }));
      }
      if (d.safety) setSafety((prev) => ({ ...prev, ...d.safety }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [companyId]);

  const onSave = async (e) => {
    e.preventDefault();
    const coName = companyName.trim();
    if (!coName) {
      showToast('Company name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await saFetch(`/companies/${companyId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: coName,
          chatbotName: chatbotName.trim(),
          iconUrl: iconUrl.trim() || undefined,
          greetingMessage: greetingMessage.trim() || undefined,
          widget: { position: widgetPosition },
          leadNotifications: {
            emailEnabled: leadEmailNotificationsEnabled,
            email: leadNotificationEmail.trim() || null,
          },
          autoTrigger: {
            enabled: autoTrigger.openMode === 'auto',
            openMode: autoTrigger.openMode,
            afterSeconds: autoTrigger.afterSeconds,
            afterScrollPercent: autoTrigger.afterScrollPercent,
            onlySelectedPages: autoTrigger.onlySelectedPages,
            onPricingPage: autoTrigger.onPricingPage,
            onPortfolioPage: autoTrigger.onPortfolioPage,
            selectedPages: autoTrigger.selectedPages,
          },
          escalation,
          safety,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || 'Failed to save');
      setData(updated);
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="sa-loading">Loading settings…</div>;

  return (
    <div className="sa-page">
      <div className="sa-page-header">
        <div>
          <Link to={`/super-admin/companies/${companyId}`} className="sa-breadcrumb">← Company</Link>
          <h2 className="sa-page-title">Company Settings</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/super-admin/companies/${companyId}/api-settings`} className="sa-btn sa-btn-ghost sa-btn-sm">API Settings</Link>
          <button type="submit" form="sa-company-settings-form" className="sa-btn sa-btn-primary sa-btn-sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <form id="sa-company-settings-form" className="sa-panel" onSubmit={onSave}>
        <div className="sa-field">
          <label>Company name</label>
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="sa-field">
          <label>AI chatbot name</label>
          <input type="text" value={chatbotName} onChange={(e) => setChatbotName(e.target.value)} />
        </div>
        <div className="sa-field">
          <label>Icon URL</label>
          <input type="url" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} placeholder="https://example.com/icon.png" />
        </div>
        <div className="sa-field">
          <label>Greeting message</label>
          <textarea className="sa-textarea" rows={3} value={greetingMessage} onChange={(e) => setGreetingMessage(e.target.value)} />
        </div>
        <div className="sa-field">
          <label>Widget side</label>
          <select value={widgetPosition} onChange={(e) => setWidgetPosition(e.target.value === 'left' ? 'left' : 'right')}>
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>
        <div className="sa-field">
          <label>Lead notification email</label>
          <div className="sa-field-check" style={{ marginBottom: 6 }}>
            <label>
              <input type="checkbox" checked={leadEmailNotificationsEnabled} onChange={(e) => setLeadEmailNotificationsEnabled(e.target.checked)} />
              Enable lead email notifications
            </label>
          </div>
          <input
            type="email"
            value={leadNotificationEmail}
            onChange={(e) => setLeadNotificationEmail(e.target.value)}
            disabled={!leadEmailNotificationsEnabled}
            placeholder="owner@company.com"
          />
        </div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Auto Trigger</h4>
        <div className="sa-field">
          <label>Open mode</label>
          <select value={autoTrigger.openMode} onChange={(e) => setAutoTrigger((p) => ({ ...p, openMode: e.target.value === 'click' ? 'click' : 'auto' }))}>
            <option value="auto">Auto</option>
            <option value="click">Click only</option>
          </select>
        </div>
        <div className="sa-field-row">
          <div className="sa-field" style={{ flex: 1 }}>
            <label>After seconds</label>
            <input type="number" min={0} max={120} value={autoTrigger.afterSeconds} onChange={(e) => setAutoTrigger((p) => ({ ...p, afterSeconds: Number(e.target.value) || 0 }))} />
          </div>
          <div className="sa-field" style={{ flex: 1 }}>
            <label>After scroll percent</label>
            <input type="number" min={0} max={100} value={autoTrigger.afterScrollPercent} onChange={(e) => setAutoTrigger((p) => ({ ...p, afterScrollPercent: Number(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="sa-field-check">
          <label><input type="checkbox" checked={autoTrigger.onlySelectedPages} onChange={(e) => setAutoTrigger((p) => ({ ...p, onlySelectedPages: e.target.checked }))} />On specific pages only</label>
        </div>
        <div className="sa-field-check">
          <label><input type="checkbox" checked={autoTrigger.onPricingPage} onChange={(e) => setAutoTrigger((p) => ({ ...p, onPricingPage: e.target.checked }))} />On pricing page</label>
        </div>
        <div className="sa-field-check">
          <label><input type="checkbox" checked={autoTrigger.onPortfolioPage} onChange={(e) => setAutoTrigger((p) => ({ ...p, onPortfolioPage: e.target.checked }))} />On portfolio page</label>
        </div>
        <div className="sa-field">
          <label>Specific page rules</label>
          <textarea className="sa-textarea" rows={3} value={autoTrigger.selectedPages} onChange={(e) => setAutoTrigger((p) => ({ ...p, selectedPages: e.target.value }))} />
        </div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Escalation</h4>
        <div className="sa-field-check"><label><input type="checkbox" checked={escalation.triggers.userRequestsHuman} onChange={(e) => setEscalation((x) => ({ ...x, triggers: { ...x.triggers, userRequestsHuman: e.target.checked } }))} />User requests human</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={escalation.triggers.aiConfidenceLow} onChange={(e) => setEscalation((x) => ({ ...x, triggers: { ...x.triggers, aiConfidenceLow: e.target.checked } }))} />Low AI confidence</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={escalation.actions.instantNotification} onChange={(e) => setEscalation((x) => ({ ...x, actions: { ...x.actions, instantNotification: e.target.checked } }))} />Instant notification</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={escalation.actions.chatTakeoverAlert} onChange={(e) => setEscalation((x) => ({ ...x, actions: { ...x.actions, chatTakeoverAlert: e.target.checked } }))} />Chat takeover alert</label></div>

        <hr style={{ borderColor: 'var(--sa-border)' }} />
        <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Safety</h4>
        <div className="sa-field-check"><label><input type="checkbox" checked={safety.blockTopicsEnabled} onChange={(e) => setSafety((s) => ({ ...s, blockTopicsEnabled: e.target.checked }))} />Block topics</label></div>
        {safety.blockTopicsEnabled && (
          <div className="sa-field">
            <input type="text" value={safety.blockTopics} onChange={(e) => setSafety((s) => ({ ...s, blockTopics: e.target.value }))} placeholder="comma-separated topics" />
          </div>
        )}
        <div className="sa-field-check"><label><input type="checkbox" checked={safety.preventInternalData} onChange={(e) => setSafety((s) => ({ ...s, preventInternalData: e.target.checked }))} />Prevent internal data exposure</label></div>
        <div className="sa-field-check"><label><input type="checkbox" checked={safety.restrictDatabasePriceExposure} onChange={(e) => setSafety((s) => ({ ...s, restrictDatabasePriceExposure: e.target.checked }))} />Restrict database price exposure</label></div>

        {data?.embed?.embedPath && (
          <>
            <hr style={{ borderColor: 'var(--sa-border)' }} />
            <h4 className="sa-panel-title" style={{ marginTop: 0 }}>Embed</h4>
            <div className="sa-text-muted">Slug: <code>{data.embed.slug}</code></div>
            <div className="sa-text-muted">Embed URL: <code>{data.embed.slugHostUrl || data.embed.embedPath}</code></div>
          </>
        )}
      </form>
    </div>
  );
}
