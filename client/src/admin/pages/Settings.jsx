import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminToast } from '../context/AdminToastContext';
import { hasAnyVoiceSettingAccess, mergeAdminVisibility } from '../../constants/adminVisibility';
import PhoneInputWithCountryCode from '../../components/PhoneInputWithCountryCode';
import {
  normalizeUrlForSubmit,
  splitPhoneForForm,
  validatePhone,
  validateEmail,
} from '../../lib/contactValidation';

/** Origin where the chat app + /embed/* is served (API host without /api). */
function getEmbedAppOrigin() {
  const u = import.meta.env.VITE_API_URL || '';
  if (u) return u.replace(/\/api\/?$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function buildIntegrationDemoUrl({ embed, companyName, chatbotName, companyId }) {
  const originFallback = getEmbedAppOrigin() || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!embed?.embedPath) return `${originFallback}/embed-integration-demo.html`;

  const widgetTitle = (chatbotName || '').trim() || (companyName || '').trim();
  const base = embed.embedUrl || `${originFallback}${embed.embedPath}`;

  try {
    const parsed = new URL(base, typeof window !== 'undefined' ? window.location.origin : originFallback);
    const demoParams = new URLSearchParams({
      mode: 'script',
      appOrigin: parsed.origin,
      exactProject: parsed.origin === 'http://localhost:7001' ? '1' : '0',
      slug: embed?.slug || '',
      companyId: companyId || '',
      companyName: widgetTitle,
      apiKey: '',
    });
    return `${parsed.origin}/embed-integration-demo.html?${demoParams.toString()}`;
  } catch {
    return `${originFallback}/embed-integration-demo.html`;
  }
}

const cardStyle = {
  background: 'var(--chat-surface)',
  border: '1px solid var(--chat-border)',
};
const labelStyle = { color: 'var(--chat-text)' };
const mutedStyle = { color: 'var(--chat-muted)' };
const headingStyle = { color: 'var(--chat-text-heading)', fontWeight: 700 };

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

function normalizeAutoTriggerMode(value) {
  return String(value || '').trim().toLowerCase() === 'click' ? 'click' : 'auto';
}

function defaultAutoTrigger() {
  return {
    enabled: true,
    openMode: 'auto',
    afterSeconds: 8,
    afterScrollPercent: 40,
    onlySelectedPages: false,
    onPricingPage: false,
    onPortfolioPage: false,
    selectedPages: '',
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

function getActiveSettingsSection(activeTab, generalSubTab) {
  if (activeTab === 'general') {
    if (generalSubTab === 'business') return 'general-business';
    if (generalSubTab === 'website') return 'general-website';
    return 'general-branding';
  }
  if (activeTab === 'chat') return 'chat';
  if (activeTab === 'policies') return 'policies';
  return 'general-branding';
}

export default function Settings() {
  const { authFetch } = useAuth();
  const { showToast } = useAdminToast();
  const location = useLocation();
  const [companyName, setCompanyName] = useState('');
  const [settingsCompanyId, setSettingsCompanyId] = useState('');
  const [chatbotName, setChatbotName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [iconUploadPending, setIconUploadPending] = useState(false);
  const [iconUploadError, setIconUploadError] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [bizName, setBizName] = useState('');
  const [bizDescription, setBizDescription] = useState('');
  const [bizIndustryType, setBizIndustryType] = useState('');
  const [bizServiceCategories, setBizServiceCategories] = useState('');
  const [bizContactEmail, setBizContactEmail] = useState('');
  const [bizContactPhoneCode, setBizContactPhoneCode] = useState('+1');
  const [bizContactPhoneLocal, setBizContactPhoneLocal] = useState('');
  const [languagePrimary, setLanguagePrimary] = useState('en');
  const [languageCatalog, setLanguageCatalog] = useState([]);
  const [languageMulti, setLanguageMulti] = useState(false);
  const [languageAuto, setLanguageAuto] = useState(true);
  const [languageManual, setLanguageManual] = useState(false);
  const [languageExtra, setLanguageExtra] = useState([]);
  const [widgetPosition, setWidgetPosition] = useState('right');
  const [leadEmailNotificationsEnabled, setLeadEmailNotificationsEnabled] = useState(false);
  const [leadNotificationEmail, setLeadNotificationEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoTrigger, setAutoTrigger] = useState(defaultAutoTrigger);
  const [escalation, setEscalation] = useState(defaultEscalation);
  const [safety, setSafety] = useState(defaultSafety);
  const [embed, setEmbed] = useState(null);
  const [adminVisibility, setAdminVisibility] = useState(() => mergeAdminVisibility());
  const [activeTab, setActiveTab] = useState('general');
  /** Sub-sections inside General (reduces scrolling). */
  const [generalSubTab, setGeneralSubTab] = useState('branding');

  const tabChatVisible = adminVisibility.settings.chatLanguages || adminVisibility.settings.autoTrigger;
  const tabPoliciesVisible = adminVisibility.settings.escalation || adminVisibility.settings.safety;

  const validTabs = useMemo(() => {
    const t = ['general'];
    if (tabChatVisible) t.push('chat');
    if (tabPoliciesVisible) t.push('policies');
    return t;
  }, [tabChatVisible, tabPoliciesVisible]);

  useEffect(() => {
    if (!validTabs.includes(activeTab)) setActiveTab('general');
  }, [validTabs, activeTab]);

  useEffect(() => {
    if (location.hash === '#chatbot-name' || location.hash === '#company-name') {
      setActiveTab('general');
      setGeneralSubTab('branding');
      requestAnimationFrame(() => {
        const id = location.hash === '#company-name' ? 'company-name' : 'chatbot-name';
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash, location.pathname]);

  useEffect(() => {
    authFetch('/settings')
      .then(async (settingsRes) => {
        if (!settingsRes.ok) throw new Error('Failed to load settings');
        const d = await settingsRes.json();

        setEmbed(d.embed || null);
        setSettingsCompanyId(d.companyId || '');
        setCompanyName(d.companyName || d.name || '');
        setChatbotName(d.chatbotName ?? d.displayName ?? '');
        setIconUrl(d.iconUrl || '');
        setGreetingMessage(d.greetingMessage || '');
        const bi = d.businessInformation || {};
        setBizName(bi.businessName || '');
        setBizDescription(bi.businessDescription || '');
        setBizIndustryType(bi.industryType || '');
        setBizServiceCategories(bi.serviceCategories || '');
        setBizContactEmail(bi.contactEmail || '');
        const parsedBizPhone = splitPhoneForForm(bi.contactPhone || '', '+1');
        setBizContactPhoneCode(parsedBizPhone.countryCode);
        setBizContactPhoneLocal(parsedBizPhone.localNumber);
        setWidgetPosition(d.widget?.position === 'left' ? 'left' : 'right');
        setLeadEmailNotificationsEnabled(Boolean(d.leadNotifications?.emailEnabled));
        setLeadNotificationEmail(d.leadNotifications?.email || '');
        if (d.autoTrigger) {
          setAutoTrigger((prev) => {
            const next = { ...prev, ...d.autoTrigger };
            next.openMode = normalizeAutoTriggerMode(next.openMode);
            next.enabled = next.openMode === 'auto';
            return next;
          });
        }
        if (d.escalation) {
          setEscalation((prev) => ({
            triggers: { ...prev.triggers, ...d.escalation.triggers },
            actions: { ...prev.actions, ...d.escalation.actions },
            highValueLeadScoreThreshold: d.escalation.highValueLeadScoreThreshold ?? prev.highValueLeadScoreThreshold,
          }));
        }
        if (d.safety) {
          setSafety((prev) => ({ ...prev, ...d.safety }));
        }
        if (d.language) {
          setLanguagePrimary(d.language.primary || 'en');
          setLanguageMulti(Boolean(d.language.multiEnabled));
          setLanguageAuto(d.language.autoDetectEnabled !== false);
          setLanguageManual(Boolean(d.language.manualSwitchEnabled));
          setLanguageCatalog(Array.isArray(d.language.catalog) ? d.language.catalog : []);
          setLanguageExtra(Array.isArray(d.language.extraLocales) ? d.language.extraLocales : []);
        }
        setAdminVisibility(mergeAdminVisibility(d.adminVisibility));
      })
      .catch(() => showToast('Failed to load settings', 'error'));
  }, [authFetch, showToast]);

  const validateIconUploadFile = (file) => {
    if (!file) return 'Please choose an icon file.';
    if (file.size <= 0) return 'Selected icon file is empty.';
    if (file.size > 1024 * 1024) return 'Icon must be 1MB or smaller.';

    const name = String(file.name || '').toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const allowedExt = new Set(['.ico', '.png', '.jpg', '.jpeg', '.webp', '.svg']);
    if (!allowedExt.has(ext)) {
      return 'Only ICO, PNG, JPG, JPEG, WEBP, or SVG files are allowed.';
    }
    return '';
  };

  const uploadIconFile = async (file) => {
    const validationError = validateIconUploadFile(file);
    if (validationError) {
      setIconUploadError(validationError);
      return;
    }

    setIconUploadPending(true);
    setIconUploadError('');
    try {
      const formData = new FormData();
      formData.append('icon', file);
      const res = await authFetch('/settings/icon-upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Failed to upload icon.');
      const nextIconUrl = String(payload.iconUrl || '').trim();
      if (!nextIconUrl) throw new Error('Upload succeeded but icon URL is missing.');
      setIconUrl(nextIconUrl);
      showToast('Icon uploaded successfully.', 'success');
    } catch (err) {
      const msg = err.message || 'Failed to upload icon.';
      setIconUploadError(msg);
      showToast(msg, 'error');
    } finally {
      setIconUploadPending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const activeSection = getActiveSettingsSection(activeTab, generalSubTab);
    const coName = companyName.trim();
    var payload = {};

    if (activeSection === 'general-branding') {
      if (!coName) {
        showToast('Company name is required', 'error');
        return;
      }
      const normalizedIconUrl = normalizeUrlForSubmit(iconUrl, { allowRelativePath: true });
      if (normalizedIconUrl === null) {
        showToast('Please enter a valid Icon URL.', 'error');
        return;
      }
      payload = {
        companyName: coName,
        chatbotName: chatbotName.trim(),
        iconUrl: normalizedIconUrl || undefined,
        greetingMessage: greetingMessage.trim(),
      };
    }

    if (activeSection === 'general-business') {
      const phoneCheck = validatePhone(bizContactPhoneCode, bizContactPhoneLocal);
      if (!phoneCheck.valid) {
        showToast(phoneCheck.error, 'error');
        return;
      }
      if (bizContactEmail.trim()) {
        const emailCheck = validateEmail(bizContactEmail);
        if (!emailCheck.valid) {
          showToast('Business contact email: ' + emailCheck.error, 'error');
          return;
        }
      }
      payload = {
        businessInformation: {
          businessName: bizName.trim(),
          businessDescription: bizDescription.trim(),
          industryType: bizIndustryType.trim(),
          serviceCategories: bizServiceCategories.trim(),
          contactEmail: bizContactEmail.trim(),
          contactPhone: phoneCheck.normalized,
        },
      };
    }

    if (activeSection === 'general-website') {
      if (leadNotificationEmail.trim()) {
        const leadEmailCheck = validateEmail(leadNotificationEmail);
        if (!leadEmailCheck.valid) {
          showToast('Lead notification email: ' + leadEmailCheck.error, 'error');
          return;
        }
      }
      payload = {
        widget: {
          position: widgetPosition,
        },
        leadNotifications: {
          emailEnabled: leadEmailNotificationsEnabled,
          email: leadNotificationEmail.trim() || null,
        },
      };
    }

    if (activeSection === 'chat') {
      payload = {
        ...(adminVisibility.settings.autoTrigger ? {
          autoTrigger: {
            enabled: autoTrigger.openMode === 'auto',
            openMode: normalizeAutoTriggerMode(autoTrigger.openMode),
            afterSeconds: autoTrigger.afterSeconds,
            afterScrollPercent: autoTrigger.afterScrollPercent,
            onlySelectedPages: autoTrigger.onlySelectedPages,
            onPricingPage: autoTrigger.onPricingPage,
            onPortfolioPage: autoTrigger.onPortfolioPage,
            selectedPages: autoTrigger.selectedPages,
          },
        } : {}),
        ...(adminVisibility.settings.chatLanguages ? {
          language: {
            primary: languagePrimary,
            multiEnabled: languageMulti,
            autoDetectEnabled: languageAuto,
            manualSwitchEnabled: languageManual,
            extraLocales: languageExtra,
          },
        } : {}),
      };
    }

    if (activeSection === 'policies') {
      payload = {
        ...(adminVisibility.settings.escalation ? {
          escalation: {
            triggers: escalation.triggers,
            actions: escalation.actions,
            highValueLeadScoreThreshold: escalation.highValueLeadScoreThreshold,
          },
        } : {}),
        ...(adminVisibility.settings.safety ? {
          safety: {
            blockTopicsEnabled: safety.blockTopicsEnabled,
            blockTopics: safety.blockTopics || '',
            preventInternalData: safety.preventInternalData,
            restrictDatabasePriceExposure: safety.restrictDatabasePriceExposure,
            disableCompetitorComparisons: safety.disableCompetitorComparisons,
            restrictFileSharing: safety.restrictFileSharing,
          },
        } : {}),
      };
    }

    if (!Object.keys(payload).length) {
      showToast('Nothing to save for this tab.', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      await res.json();
      showToast('Settings saved', 'success');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateEscalationTrigger = (key, value) => {
    setEscalation((e) => ({ ...e, triggers: { ...e.triggers, [key]: value } }));
  };
  const updateEscalationAction = (key, value) => {
    setEscalation((e) => ({ ...e, actions: { ...e.actions, [key]: value } }));
  };
  const updateSafety = (key, value) => {
    setSafety((s) => ({ ...s, [key]: value }));
  };
  const isAutoOpenMode = autoTrigger.openMode === 'auto';
  const showVoiceSettingsCard = hasAnyVoiceSettingAccess(adminVisibility);

  const tabBtnClass = (id) =>
    `nav-link py-2 px-3 ${activeTab === id ? 'active' : ''}`;

  const generalSubBtnClass = (id) =>
    `nav-link py-1 px-3 small ${generalSubTab === id ? 'active' : ''}`;

  return (
    <div className="p-4" id="settings-top">
      <h5 className="mb-3" style={{ color: 'var(--chat-text-heading)' }}>Company settings</h5>
      <form onSubmit={handleSubmit}>
        <ul
          className="nav nav-tabs flex-wrap gap-1 mb-3 border-bottom"
          style={{ borderColor: 'var(--chat-border)' }}
          role="tablist"
        >
          <li className="nav-item" role="presentation">
            <button type="button" className={tabBtnClass('general')} onClick={() => setActiveTab('general')} style={{ color: activeTab === 'general' ? 'var(--chat-text-heading)' : 'var(--chat-muted)', background: activeTab === 'general' ? 'var(--chat-surface)' : 'transparent', borderColor: 'var(--chat-border)' }}>
              General
            </button>
          </li>
          {tabChatVisible ? (
            <li className="nav-item" role="presentation">
              <button type="button" className={tabBtnClass('chat')} onClick={() => setActiveTab('chat')} style={{ color: activeTab === 'chat' ? 'var(--chat-text-heading)' : 'var(--chat-muted)', background: activeTab === 'chat' ? 'var(--chat-surface)' : 'transparent', borderColor: 'var(--chat-border)' }}>
                Chat &amp; automation
              </button>
            </li>
          ) : null}
          {tabPoliciesVisible ? (
            <li className="nav-item" role="presentation">
              <button type="button" className={tabBtnClass('policies')} onClick={() => setActiveTab('policies')} style={{ color: activeTab === 'policies' ? 'var(--chat-text-heading)' : 'var(--chat-muted)', background: activeTab === 'policies' ? 'var(--chat-surface)' : 'transparent', borderColor: 'var(--chat-border)' }}>
                Escalation &amp; safety
              </button>
            </li>
          ) : null}
        </ul>

        {activeTab === 'general' && (
        <div className="settings-tab-panel">
        <ul
          className="nav nav-tabs flex-wrap gap-1 mb-3 pb-2 border-bottom"
          style={{ borderColor: 'var(--chat-border)' }}
          role="tablist"
          aria-label="General settings sections"
        >
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={generalSubBtnClass('branding')}
              onClick={() => setGeneralSubTab('branding')}
              style={{
                color: generalSubTab === 'branding' ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
                background: generalSubTab === 'branding' ? 'var(--chat-surface)' : 'transparent',
                borderColor: 'var(--chat-border)',
              }}
            >
              Branding &amp; greeting
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={generalSubBtnClass('business')}
              onClick={() => setGeneralSubTab('business')}
              style={{
                color: generalSubTab === 'business' ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
                background: generalSubTab === 'business' ? 'var(--chat-surface)' : 'transparent',
                borderColor: 'var(--chat-border)',
              }}
            >
              Business information
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={generalSubBtnClass('website')}
              onClick={() => setGeneralSubTab('website')}
              style={{
                color: generalSubTab === 'website' ? 'var(--chat-text-heading)' : 'var(--chat-muted)',
                background: generalSubTab === 'website' ? 'var(--chat-surface)' : 'transparent',
                borderColor: 'var(--chat-border)',
              }}
            >
              Widget, embed &amp; leads
            </button>
          </li>
        </ul>
        <div className="row g-4 align-items-start">
          <div className="col-12">
            {generalSubTab === 'branding' && (
            <>
            <div className="mb-3" id="company-name">
              <label className="form-label">Company name <span className="text-danger">*</span></label>
              <input
                type="text"
                className="form-control"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                autoComplete="organization"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                Your business or team name (admin, reports, lead emails, training context). Distinct from the name shown in the chat widget.
              </div>
            </div>

            <div className="mb-3" id="chatbot-name">
              <label className="form-label">AI chatbot name</label>
              <input
                type="text"
                className="form-control"
                value={chatbotName}
                onChange={(e) => setChatbotName(e.target.value)}
                placeholder="e.g. Acme Support Assistant"
                autoComplete="off"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                Shown in the chat header, website widget, and embedded chat. If empty, the company name above is used in the widget.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Icon URL</label>
              <input
                type="text"
                className="form-control"
                value={iconUrl}
                onChange={(e) => {
                  setIconUrl(e.target.value);
                  if (iconUploadError) setIconUploadError('');
                }}
                placeholder="https://example.com/icon.ico or /favicon.ico"
                inputMode="url"
                autoComplete="off"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                <label className="btn btn-sm btn-outline-secondary mb-0">
                  {iconUploadPending ? 'Uploading...' : 'Upload icon file'}
                  <input
                    type="file"
                    accept=".ico,.png,.jpg,.jpeg,.webp,.svg,image/x-icon,image/vnd.microsoft.icon,image/png,image/jpeg,image/webp,image/svg+xml"
                    className="d-none"
                    disabled={iconUploadPending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadIconFile(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                <span className="small" style={{ color: 'var(--chat-muted)' }}>
                  Max 1MB. Allowed: ICO, PNG, JPG, JPEG, WEBP, SVG.
                </span>
              </div>
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                PNG, SVG, or ICO. Use a full <code>https://…</code> URL, or a path like <code>/favicon.ico</code> relative to your site.
              </div>
              {iconUploadError ? (
                <div className="small mt-1" style={{ color: '#dc3545' }}>
                  {iconUploadError}
                </div>
              ) : null}
              {iconUrl && (
                <div className="mt-2">
                  <img
                    src={iconUrl}
                    alt="Preview"
                    style={{ width: 48, height: 48, objectFit: 'contain', objectPosition: 'center', borderRadius: 8, background: 'var(--chat-surface)' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label">Greeting message</label>
              <textarea
                className="form-control"
                rows={3}
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="Custom welcome message"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
            </div>
            </>
            )}

            {generalSubTab === 'business' && (
            <div className="mb-4 p-3 rounded-3" style={cardStyle}>
              <div className="fw-semibold mb-2" style={headingStyle}>Business information</div>
              <p className="small mb-3" style={mutedStyle}>
                Optional context for the AI when chatting with visitors (business identity, services, public contact). If left blank, the assistant behaves as before. If provided, it may reference this when answers benefit—knowledge base still wins for product and policy facts.
              </p>
              <div className="mb-3">
                <label className="form-label">Business name</label>
                <input
                  type="text"
                  className="form-control"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Business description</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={bizDescription}
                  onChange={(e) => setBizDescription(e.target.value)}
                  placeholder="Short description of what the business does"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Industry type</label>
                <input
                  type="text"
                  className="form-control"
                  value={bizIndustryType}
                  onChange={(e) => setBizIndustryType(e.target.value)}
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Service categories</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={bizServiceCategories}
                  onChange={(e) => setBizServiceCategories(e.target.value)}
                  placeholder="e.g. Web design, SEO, Support (comma or line separated)"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Business contact email</label>
                <input
                  type="email"
                  className="form-control"
                  value={bizContactEmail}
                  onChange={(e) => setBizContactEmail(e.target.value)}
                  placeholder="hello@business.com"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
              <div className="mb-0">
                <label className="form-label">Business contact phone number</label>
                <PhoneInputWithCountryCode
                  countryCode={bizContactPhoneCode}
                  onCountryCodeChange={setBizContactPhoneCode}
                  localNumber={bizContactPhoneLocal}
                  onLocalNumberChange={setBizContactPhoneLocal}
                  selectClassName="form-select"
                  inputClassName="form-control"
                  inputStyle={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                  selectStyle={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                />
              </div>
            </div>
            )}

            {generalSubTab === 'website' && (
            <>
            <div className="mb-3">
              <label className="form-label">Widget side</label>
              <select
                className="form-select"
                value={widgetPosition}
                onChange={(e) => setWidgetPosition(e.target.value === 'left' ? 'left' : 'right')}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              >
                <option value="right">Right side</option>
                <option value="left">Left side</option>
              </select>
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                Controls launcher and chat panel alignment on website widget.
              </div>
            </div>

            {embed?.embedPath && (
              <div className="mb-3 p-3 rounded-3" style={{ ...cardStyle, background: 'var(--chat-bg)' }}>
                <div className="fw-semibold mb-2" style={headingStyle}>Website embed</div>
                <p className="small mb-2" style={mutedStyle}>
                  Third‑party sites use either the <strong>script</strong> snippet (floating widget) or an <strong>iframe</strong> pointing at{' '}
                  <code>/embed/{'{slug}'}/{'{embed secret}'}?companyId={'{company id}'}</code> on your app host. The secret is validated server-side; the
                  company id in the query must match the company linked to that embed. When debugging, Admin → Logs → System tags iframe traffic as{' '}
                  <code className="text-nowrap">embed-iframe-page</code> and script embeds as <code className="text-nowrap">embed-script</code>.
                </p>
                <div className="small mb-1" style={labelStyle}>Slug</div>
                <code className="small d-block mb-2" style={{ wordBreak: 'break-all' }}>{embed.slug}</code>
                <div className="small mb-1" style={labelStyle}>Embed page URL (iframe — same as “Open host page”)</div>
                <div className="input-group input-group-sm mb-2">
                  <input
                    type="text"
                    readOnly
                    className="form-control font-monospace"
                    style={{ fontSize: '0.8rem' }}
                    value={embed.slugHostUrl || `${getEmbedAppOrigin()}${embed.slugHostPath || ''}`}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      const v = embed.slugHostUrl || `${getEmbedAppOrigin()}${embed.slugHostPath || ''}`;
                      navigator.clipboard.writeText(v).then(() => showToast('Host URL copied', 'success')).catch(() => {});
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div className="small mb-1" style={labelStyle}>Canonical embed path (path only — for docs)</div>
                <div className="input-group input-group-sm mb-2">
                  <input
                    type="text"
                    readOnly
                    className="form-control font-monospace"
                    style={{ fontSize: '0.8rem' }}
                    value={embed.embedUrl || `${getEmbedAppOrigin()}${embed.embedPath}`}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      const v = embed.embedUrl || `${getEmbedAppOrigin()}${embed.embedPath}`;
                      navigator.clipboard.writeText(v).then(() => showToast('URL copied', 'success')).catch(() => {});
                    }}
                  >
                    Copy
                  </button>
                </div>
                {!embed.embedUrl && (
                  <p className="small mb-2" style={mutedStyle}>
                    Set <code>PUBLIC_APP_URL</code> on the server for canonical URLs. Otherwise values use <code>VITE_API_URL</code> origin (without <code>/api</code>) or this page&apos;s origin.
                  </p>
                )}
                <div className="small mb-1" style={labelStyle}>Full-page iframe (customer site)</div>
                <textarea
                  readOnly
                  className="form-control font-monospace mb-2"
                  style={{ fontSize: '0.75rem', minHeight: '4.5rem' }}
                  value={embed.iframeHostSnippet || ''}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary me-2"
                  onClick={() => {
                    const u = embed.slugHostUrl || `${getEmbedAppOrigin()}${embed.slugHostPath || ''}`;
                    window.open(u, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open host page (new tab)
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    const demoUrl = buildIntegrationDemoUrl({ embed, companyName, chatbotName, companyId: settingsCompanyId });
                    window.open(demoUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open integration demo
                </button>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Lead notifications</label>
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="leadEmailEnabled"
                  checked={leadEmailNotificationsEnabled}
                  onChange={(e) => setLeadEmailNotificationsEnabled(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="leadEmailEnabled">
                  Send email notification when a new lead is captured
                </label>
              </div>
              <input
                type="email"
                className="form-control"
                value={leadNotificationEmail}
                onChange={(e) => setLeadNotificationEmail(e.target.value)}
                placeholder="owner@company.com"
                disabled={!leadEmailNotificationsEnabled}
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
              />
              <div className="form-text" style={{ color: 'var(--chat-muted)' }}>
                Email includes lead name, requested service, and urgency level.
              </div>
            </div>

            {showVoiceSettingsCard && (
            <div className="p-3 rounded-3 mt-3" style={cardStyle}>
              <div className="mb-2" style={{ color: 'var(--chat-text-heading)', fontWeight: 700 }}>
                Voice settings
              </div>
              <div className="form-text" style={mutedStyle}>
                Voice options now have a dedicated page so you can manage voice mode and male/female response voice separately.
              </div>
              <Link to="/admin/voice-settings" className="btn btn-sm btn-outline-primary mt-3">
                Open voice settings
              </Link>
            </div>
            )}
            </>
            )}
          </div>
        </div>
        </div>
        )}

        {activeTab === 'chat' && tabChatVisible && (
        <div className="settings-tab-panel">
            {adminVisibility.settings.chatLanguages && (
            <div className="mb-4 p-3 rounded-3" style={cardStyle}>
              <div className="fw-semibold mb-2" style={headingStyle}>Chat languages</div>
              <p className="small mb-3" style={mutedStyle}>
                Default language for replies when the visitor&apos;s language is unclear. With multi-language enabled, the assistant matches the visitor when possible.
                ElevenLabs voice uses the same language hint as the generated reply (multilingual voices).
              </p>
              <div className="mb-3">
                <label className="form-label">Primary language</label>
                <select
                  className="form-select"
                  value={languagePrimary}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLanguagePrimary(next);
                    setLanguageExtra((prev) => prev.filter((c) => c !== next));
                  }}
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                >
                  {(languageCatalog.length
                    ? languageCatalog
                    : [{ code: 'en', label: 'English' }]
                  ).map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="lang-multi"
                  checked={languageMulti}
                  onChange={(e) => setLanguageMulti(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="lang-multi" style={labelStyle}>
                  Multi-language replies (match visitor language when supported)
                </label>
              </div>
              {languageMulti && (
                <>
                  <div className="form-check mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="lang-auto"
                      checked={languageAuto}
                      onChange={(e) => setLanguageAuto(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="lang-auto" style={labelStyle}>
                      Auto-detect language from visitor messages
                    </label>
                  </div>
                  <div className="form-check mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="lang-manual"
                      checked={languageManual}
                      onChange={(e) => setLanguageManual(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="lang-manual" style={labelStyle}>
                      Allow manual language switch (widget / client)
                    </label>
                  </div>
                  <label className="form-label">Additional reply languages (optional)</label>
                  <p className="small mb-1" style={mutedStyle}>
                    Hold Ctrl (Windows) or ⌘ (Mac) to select multiple. Leave empty to allow any supported language together with the primary.
                  </p>
                  <select
                    multiple
                    className="form-select"
                    size={Math.min(12, Math.max(6, (languageCatalog.length || 8) - 1))}
                    value={languageExtra}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                      setLanguageExtra(selected.filter((c) => c !== languagePrimary));
                    }}
                    style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                  >
                    {languageCatalog
                      .filter((opt) => opt.code !== languagePrimary)
                      .map((opt) => (
                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                      ))}
                  </select>
                </>
              )}
            </div>
            )}

        {adminVisibility.settings.autoTrigger && (
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Auto-Trigger Settings</div>
          <p className="small mb-3" style={mutedStyle}>Define when the chatbot proactively opens for visitors.</p>

          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small" style={labelStyle}>How should the chat panel open?</label>
              <div className="d-flex flex-column gap-2">
                <div className="form-check">
                  <input
                    id="auto_open_mode_click"
                    className="form-check-input"
                    type="radio"
                    name="auto_open_mode"
                    checked={autoTrigger.openMode === 'click'}
                    onChange={() => setAutoTrigger((prev) => ({ ...prev, openMode: 'click', enabled: false }))}
                  />
                  <label className="form-check-label" htmlFor="auto_open_mode_click" style={labelStyle}>Open only when visitor clicks widget</label>
                </div>
                <div className="form-check">
                  <input
                    id="auto_open_mode_auto"
                    className="form-check-input"
                    type="radio"
                    name="auto_open_mode"
                    checked={autoTrigger.openMode === 'auto'}
                    onChange={() => setAutoTrigger((prev) => ({ ...prev, openMode: 'auto', enabled: true }))}
                  />
                  <label className="form-check-label" htmlFor="auto_open_mode_auto" style={labelStyle}>Auto-trigger panel from timing, scroll, and page rules</label>
                </div>
              </div>
              <div className="form-text" style={mutedStyle}>Widget launcher stays visible in both modes.</div>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small" style={labelStyle}>After X seconds on page</label>
              <input
                type="number"
                min={0}
                max={120}
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                value={autoTrigger.afterSeconds}
                onChange={(e) => setAutoTrigger((prev) => ({ ...prev, afterSeconds: Number(e.target.value) || 0 }))}
                disabled={!isAutoOpenMode}
              />
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small" style={labelStyle}>After X% scroll</label>
              <input
                type="number"
                min={0}
                max={100}
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                value={autoTrigger.afterScrollPercent}
                onChange={(e) => setAutoTrigger((prev) => ({ ...prev, afterScrollPercent: Number(e.target.value) || 0 }))}
                disabled={!isAutoOpenMode}
              />
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small" style={labelStyle}>Page targeting</label>
              <div className="d-flex flex-column gap-2">
                <div className="form-check">
                  <input
                    id="auto_selected_pages"
                    className="form-check-input"
                    type="checkbox"
                    checked={autoTrigger.onlySelectedPages}
                    onChange={(e) => setAutoTrigger((prev) => ({ ...prev, onlySelectedPages: e.target.checked }))}
                    disabled={!isAutoOpenMode}
                  />
                  <label className="form-check-label" htmlFor="auto_selected_pages" style={labelStyle}>On specific pages only</label>
                </div>
                <div className="form-check">
                  <input
                    id="auto_pricing_page"
                    className="form-check-input"
                    type="checkbox"
                    checked={autoTrigger.onPricingPage}
                    onChange={(e) => setAutoTrigger((prev) => ({ ...prev, onPricingPage: e.target.checked }))}
                    disabled={!isAutoOpenMode}
                  />
                  <label className="form-check-label" htmlFor="auto_pricing_page" style={labelStyle}>On pricing page</label>
                </div>
                <div className="form-check">
                  <input
                    id="auto_portfolio_page"
                    className="form-check-input"
                    type="checkbox"
                    checked={autoTrigger.onPortfolioPage}
                    onChange={(e) => setAutoTrigger((prev) => ({ ...prev, onPortfolioPage: e.target.checked }))}
                    disabled={!isAutoOpenMode}
                  />
                  <label className="form-check-label" htmlFor="auto_portfolio_page" style={labelStyle}>On portfolio page</label>
                </div>
              </div>
            </div>

            <div className="col-12">
              <label className="form-label small" style={labelStyle}>Specific page rules</label>
              <textarea
                rows={3}
                className="form-control form-control-sm"
                style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                placeholder="/services\n/pricing\n/portfolio"
                value={autoTrigger.selectedPages}
                onChange={(e) => setAutoTrigger((prev) => ({ ...prev, selectedPages: e.target.value }))}
                disabled={!isAutoOpenMode}
              />
              <div className="form-text" style={mutedStyle}>
                Add one path per line. Example: /services, /pricing, /portfolio.
              </div>
            </div>
          </div>
        </div>
        )}
        </div>
        )}

        {activeTab === 'policies' && tabPoliciesVisible && (
        <div className="settings-tab-panel">
        {/* Escalation */}
        {adminVisibility.settings.escalation && (
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Escalation</div>
          <p className="small mb-3" style={mutedStyle}>When to escalate to a human and which actions to take.</p>
          <div className="row g-3">
            <div className="col-12">
              <div className="small fw-semibold mb-2" style={labelStyle}>Triggers</div>
              <div className="d-flex flex-wrap gap-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_user"
                    checked={escalation.triggers.userRequestsHuman}
                    onChange={(e) => updateEscalationTrigger('userRequestsHuman', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_user" style={labelStyle}>User requests human</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_confidence"
                    checked={escalation.triggers.aiConfidenceLow}
                    onChange={(e) => updateEscalationTrigger('aiConfidenceLow', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_confidence" style={labelStyle}>Low AI confidence</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_urgent"
                    checked={escalation.triggers.urgentKeywords}
                    onChange={(e) => updateEscalationTrigger('urgentKeywords', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_urgent" style={labelStyle}>Urgent keywords</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_angry"
                    checked={escalation.triggers.angrySentiment}
                    onChange={(e) => updateEscalationTrigger('angrySentiment', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_angry" style={labelStyle}>Angry sentiment</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="trig_highvalue"
                    checked={escalation.triggers.highValueLead}
                    onChange={(e) => updateEscalationTrigger('highValueLead', e.target.checked)} />
                  <label className="form-check-label" htmlFor="trig_highvalue" style={labelStyle}>High-value lead</label>
                </div>
              </div>
              {escalation.triggers.highValueLead && (
                <div className="mt-2">
                  <label className="form-label small mb-1" style={labelStyle}>Score threshold (0–100)</label>
                  <input type="number" min={0} max={100} className="form-control form-control-sm" style={{ maxWidth: 100, background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                    value={escalation.highValueLeadScoreThreshold}
                    onChange={(e) => setEscalation((e) => ({ ...e, highValueLeadScoreThreshold: Number(e.target.value) || 75 }))} />
                </div>
              )}
            </div>
            <div className="col-12">
              <div className="small fw-semibold mb-2" style={labelStyle}>Actions</div>
              <div className="d-flex flex-wrap gap-3">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_notif"
                    checked={escalation.actions.instantNotification}
                    onChange={(e) => updateEscalationAction('instantNotification', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_notif" style={labelStyle}>Instant notification</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_meeting"
                    checked={escalation.actions.autoScheduleMeeting}
                    onChange={(e) => updateEscalationAction('autoScheduleMeeting', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_meeting" style={labelStyle}>Auto-schedule meeting</label>
                </div>
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="act_takeover"
                    checked={escalation.actions.chatTakeoverAlert}
                    onChange={(e) => updateEscalationAction('chatTakeoverAlert', e.target.checked)} />
                  <label className="form-check-label" htmlFor="act_takeover" style={labelStyle}>Chat takeover alert</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Safety & Compliance */}
        {adminVisibility.settings.safety && (
        <div className="mt-4 p-3 p-md-4 rounded-3 mb-4" style={cardStyle}>
          <div className="mb-3" style={headingStyle}>Safety & Compliance</div>
          <p className="small mb-3" style={mutedStyle}>Control what the AI can say and what data it exposes.</p>
          <div className="row g-3">
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_block"
                  checked={safety.blockTopicsEnabled}
                  onChange={(e) => updateSafety('blockTopicsEnabled', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_block" style={labelStyle}>Block specific topics</label>
              </div>
              {safety.blockTopicsEnabled && (
                <input type="text" className="form-control form-control-sm mt-2" placeholder="Comma-separated topics to avoid"
                  style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)', borderColor: 'var(--chat-border)' }}
                  value={safety.blockTopics}
                  onChange={(e) => updateSafety('blockTopics', e.target.value)} />
              )}
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_internal"
                  checked={safety.preventInternalData}
                  onChange={(e) => updateSafety('preventInternalData', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_internal" style={labelStyle}>Prevent exposing internal data</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_price"
                  checked={safety.restrictDatabasePriceExposure}
                  onChange={(e) => updateSafety('restrictDatabasePriceExposure', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_price" style={labelStyle}>Restrict database price exposure</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_competitor"
                  checked={safety.disableCompetitorComparisons}
                  onChange={(e) => updateSafety('disableCompetitorComparisons', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_competitor" style={labelStyle}>Disable competitor comparisons</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="safety_file"
                  checked={safety.restrictFileSharing}
                  onChange={(e) => updateSafety('restrictFileSharing', e.target.checked)} />
                <label className="form-check-label" htmlFor="safety_file" style={labelStyle}>Restrict file sharing</label>
              </div>
            </div>
          </div>
        </div>
        )}
        </div>
        )}

        <div className="mt-4 pt-3 border-top" style={{ borderColor: 'var(--chat-border)' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          <span className="small ms-3" style={{ color: 'var(--chat-muted)' }}>
            Saves every main tab and general sub-section in one request.
          </span>
        </div>
      </form>
    </div>
  );
}
