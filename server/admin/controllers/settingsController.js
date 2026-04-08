const CompanyAdmin = require('../models/CompanyAdmin');
const pool = require('../../db/index');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mergeCompanyTheme } = require('../../services/companyTheme');
const {
  getModeCatalog,
  isValidConversationModeId,
  normalizeConversationModeId,
} = require('../../services/conversationModes');
const {
  getLanguageCatalogForClient,
  getElevenLabsTtsLanguageCatalog,
  normalizeLanguagePrimaryToCode,
  parseLanguageExtraLocalesJson,
  normalizeLanguageExtraLocalesInput,
  serializeLanguageExtraLocales,
  resolveSpeechLanguageCode,
} = require('../../services/supportedChatLanguages');
const { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } = require('../../services/geminiModelService');
const {
  createCustomVoiceFromSamples,
  debugVoiceSelection,
  getVoiceList,
  getVoicePreviewText,
  getVoicePresetCatalog,
  normalizeVoiceGender,
  normalizeVoiceProfile,
  synthesizeTextResponse,
} = require('../../services/elevenlabsService');
const { logVoiceApiFailure } = require('../../services/voiceApiErrorLog');
const {
  buildAdminVisibilityPayload,
  buildPresetVoiceAccessKey,
  canAdminSetAiMode,
  canAdminSetChatLanguageExtras,
  canAdminSetChatLanguagePrimary,
  filterChatLanguageCatalogForAdmin,
  filterModeCatalogForAdmin,
  isPresetVoiceAllowed,
} = require('../../services/adminSettingsAccess');
const { normalizeHttpUrl, normalizePhoneWithCountryCode } = require('../../utils/contactValidation');

const ICON_UPLOAD_MAX_BYTES = 1 * 1024 * 1024;
const ICON_ALLOWED_EXTENSIONS = new Set(['.ico', '.png', '.jpg', '.jpeg', '.webp', '.svg']);
const ICON_ALLOWED_MIME_HINTS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

function normalizeNotificationEmail(value) {
  if (value === undefined) return undefined;
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function resolveIconUploadExtension(file = null) {
  const originalName = String(file?.originalname || '').trim().toLowerCase();
  const mime = String(file?.mimetype || '').trim().toLowerCase();
  const extFromName = path.extname(originalName);

  if (ICON_ALLOWED_EXTENSIONS.has(extFromName)) {
    return extFromName === '.jpeg' ? '.jpg' : extFromName;
  }

  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') return '.ico';
  if (mime === 'application/octet-stream' && extFromName === '.ico') return '.ico';

  return '';
}

function isAllowedIconMime(file = null) {
  const mime = String(file?.mimetype || '').trim().toLowerCase();
  if (!mime) return true;
  return ICON_ALLOWED_MIME_HINTS.includes(mime) || mime === 'application/octet-stream';
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeVoiceGenderInput(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'female') return normalized;
  return null;
}

function normalizeAiProvider(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'anthropic' || normalized === 'gemini') return normalized;
  return null;
}

function normalizeElevenLabsApiKeyInput(value) {
  if (value === undefined) return undefined;
  let key = String(value || '').trim();
  if (!key) return null;

  key = key.replace(/^['"]+|['"]+$/g, '').trim();
  key = key.replace(/^authorization\s*:\s*/i, '').trim();
  key = key.replace(/^bearer\s+/i, '').trim();
  key = key.replace(/^xi-api-key\s*[:=]\s*/i, '').trim();

  return key || null;
}

function normalizeAutoTriggerOpenMode(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'click') return normalized;
  return null;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeSelectedPages(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 30)
      .join('\n');
  }
  return String(value || '')
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 30)
    .join('\n');
}

function resolveAutoTriggerOpenMode(company) {
  const enabled = company?.auto_trigger_enabled !== false;
  const stored = String(company?.auto_trigger_open_mode || '').trim().toLowerCase();

  if (stored === 'click') return 'click';
  if (stored === 'auto') return enabled ? 'auto' : 'click';
  return enabled ? 'auto' : 'click';
}

function buildAutoTriggerPayload(company) {
  const openMode = resolveAutoTriggerOpenMode(company);
  return {
    enabled: openMode === 'auto',
    openMode,
    afterSeconds: clampInt(company?.auto_trigger_delay_seconds, 0, 120, 8),
    afterScrollPercent: clampInt(company?.auto_trigger_scroll_percent, 0, 100, 40),
    onlySelectedPages: Boolean(company?.auto_trigger_only_selected_pages),
    onPricingPage: Boolean(company?.auto_trigger_pricing_page),
    onPortfolioPage: Boolean(company?.auto_trigger_portfolio_page),
    selectedPages: String(company?.auto_trigger_selected_pages || ''),
  };
}

function getCompanyCustomVoice(company) {
  const voiceId = String(company?.voice_custom_id || '').trim();
  if (!voiceId) return null;

  return {
    voiceId,
    voiceName: String(company?.voice_custom_name || 'My Voice').trim() || 'My Voice',
    gender: company?.voice_custom_gender === 'male' ? 'male' : 'female',
  };
}

function isSettingsAccessBypassed(req) {
  return Boolean(req.adminSettingsAccessBypass);
}

function dedupeLabels(labels) {
  return Array.from(new Set(labels.filter(Boolean)));
}

function collectRestrictedAdminUpdateFields(body, company, adminVisibility) {
  const restricted = [];

  if (body?.language !== undefined) {
    if (!adminVisibility.settings.chatLanguages) {
      restricted.push('Chat languages');
    } else {
      const lang = body.language;
      const curPrimary = company?.language_primary;
      if (lang.primary !== undefined
        && !canAdminSetChatLanguagePrimary(adminVisibility, lang.primary, curPrimary)) {
        restricted.push('Chat languages');
      }
      if (lang.extraLocales !== undefined) {
        const p = lang.primary !== undefined ? lang.primary : curPrimary;
        const pNorm = normalizeLanguagePrimaryToCode(p);
        const normalizedExtras = normalizeLanguageExtraLocalesInput(lang.extraLocales, pNorm);
        if (!canAdminSetChatLanguageExtras(adminVisibility, normalizedExtras, pNorm)) {
          restricted.push('Chat languages');
        }
      }
    }
  }
  if (body?.autoTrigger !== undefined && !adminVisibility.settings.autoTrigger) {
    restricted.push('Auto-Trigger Settings');
  }
  if (body?.escalation !== undefined && !adminVisibility.settings.escalation) {
    restricted.push('Escalation');
  }
  if (body?.safety !== undefined && !adminVisibility.settings.safety) {
    restricted.push('Safety & Compliance');
  }
  if (body?.aiMode !== undefined && !canAdminSetAiMode(adminVisibility, body.aiMode, company?.ai_mode)) {
    restricted.push('AI Mode');
  }

  if (body?.voice?.enabled !== undefined && !adminVisibility.voice.enableVoiceMode) {
    restricted.push('Enable voice mode in chatbot');
  }
  if (body?.voice?.responseEnabled !== undefined && !adminVisibility.voice.enableVoiceResponse) {
    restricted.push('Enable voice response');
  }
  if (body?.voice?.ignoreEmoji !== undefined && !adminVisibility.voice.ignoreEmoji) {
    restricted.push('Ignore emojis when speaking');
  }
  if (body?.voice?.ttsLanguageCode !== undefined && !adminVisibility.voice.spokenLanguage) {
    restricted.push('Spoken language');
  }

  const requestedProfile = normalizeVoiceProfile(body?.voice?.profile)
    || normalizeVoiceProfile(company?.voice_profile)
    || 'professional';
  const requestedLanguageCode = body?.voice?.ttsLanguageCode !== undefined
    ? String(body.voice.ttsLanguageCode || '').trim().toLowerCase()
    : String(company?.voice_tts_language_code || '').trim().toLowerCase();
  const requestedGender = body?.voice?.gender !== undefined
    ? String(body.voice.gender || '').trim().toLowerCase()
    : String(company?.voice_gender || '').trim().toLowerCase();
  const requestedVoiceKey = buildPresetVoiceAccessKey(requestedProfile, requestedGender);
  const isCustomProfileRequest = requestedProfile === 'custom';
  const isVoiceSelectionChange = body?.voice?.profile !== undefined || body?.voice?.gender !== undefined;

  if (isVoiceSelectionChange) {
    if (isCustomProfileRequest) {
      if (!adminVisibility.voice.trainCustomVoice) {
        restricted.push('Train your own voice');
      }
    } else if (!adminVisibility.voice.presetVoices) {
      restricted.push('Preset voices');
    } else if (!isPresetVoiceAllowed(adminVisibility.voice.allowedPresetVoiceKeys, requestedProfile, requestedGender, requestedLanguageCode)) {
      restricted.push(`Preset voice ${requestedVoiceKey}`);
    }
  }

  return dedupeLabels(restricted);
}

function assertAdminModeAccess(req, res, company) {
  if (isSettingsAccessBypassed(req)) return true;
  const adminVisibility = buildAdminVisibilityPayload(company);
  if (adminVisibility.aiMode) return true;
  res.status(403).json({ error: 'AI mode is managed by the super admin for this company.' });
  return false;
}

function assertAdminVoiceAccess(req, res, company, { profile, gender, languageCode, requiresTraining = false, requiresPresetList = false } = {}) {
  if (isSettingsAccessBypassed(req)) return true;
  const adminVisibility = buildAdminVisibilityPayload(company);

  if (requiresTraining && !adminVisibility.voice.trainCustomVoice) {
    res.status(403).json({ error: 'Custom voice training is managed by the super admin for this company.' });
    return false;
  }

  if (requiresPresetList && !adminVisibility.voice.presetVoices) {
    res.status(403).json({ error: 'Preset voices are managed by the super admin for this company.' });
    return false;
  }

  if (profile === 'custom') {
    if (!adminVisibility.voice.trainCustomVoice) {
      res.status(403).json({ error: 'Custom voice selection is managed by the super admin for this company.' });
      return false;
    }
    return true;
  }

  if (profile && !adminVisibility.voice.presetVoices) {
    res.status(403).json({ error: 'Preset voices are managed by the super admin for this company.' });
    return false;
  }

  if (profile && gender && !isPresetVoiceAllowed(adminVisibility.voice.allowedPresetVoiceKeys, profile, gender, languageCode)) {
    res.status(403).json({ error: 'This preset voice is hidden from the admin for this company.' });
    return false;
  }

  return true;
}

async function buildVoicePayload(company) {
  const customVoice = getCompanyCustomVoice(company);
  const storedProfile = normalizeVoiceProfile(company?.voice_profile) || 'professional';
  const effectiveProfile = storedProfile === 'custom' && !customVoice ? 'professional' : storedProfile;
  const effectiveGender = effectiveProfile === 'custom'
    ? (customVoice?.gender || 'female')
    : normalizeVoiceGender(company?.voice_gender);
  const ttsRaw = String(company?.voice_tts_language_code || '').trim().toLowerCase();
  const catalogLanguageCode = ttsRaw || normalizeLanguagePrimaryToCode(company?.language_primary || 'en');

  return {
    enabled: Boolean(company?.voice_mode_enabled),
    responseEnabled: Boolean(company?.voice_response_enabled !== false),
    gender: effectiveGender,
    profile: effectiveProfile,
    ignoreEmoji: Boolean(company?.voice_ignore_emoji),
    ttsLanguageCode: ttsRaw || null,
    ttsLanguageCatalog: getElevenLabsTtsLanguageCatalog(),
    custom: customVoice
      ? {
        available: true,
        voiceId: customVoice.voiceId,
        name: customVoice.voiceName,
        gender: customVoice.gender,
      }
      : {
        available: false,
      },
    catalog: await getVoicePresetCatalog({
      customVoice,
      apiKey: company?.elevenlabs_api_key || null,
      languageCode: catalogLanguageCode,
    }),
  };
}

function buildEmbedPayload(company) {
  const slug = String(company?.embed_slug || '').trim();
  const secret = String(company?.embed_secret || '').trim();
  if (!slug || !secret) {
    return {
      slug: null,
      embedPath: null,
      embedUrl: null,
      iframeSnippet: null,
    };
  }
  const cid = encodeURIComponent(company.company_id);
  const embedPath = `/embed/${encodeURIComponent(slug)}/${encodeURIComponent(secret)}?companyId=${cid}`;
  const publicBase = String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  const embedUrl = publicBase ? `${publicBase}${embedPath}` : null;
  /** @deprecated Use embedPath — kept for older clients; same value as embedPath. */
  const slugHostPath = embedPath;
  const slugHostUrl = publicBase ? `${publicBase}${embedPath}` : embedPath;
  const originHint = publicBase || '(your app origin)';
  const iframeSnippet =
    `<iframe src="${publicBase ? embedUrl : embedPath}" title="Chat" style="width:100%;height:600px;border:0;" loading="lazy"></iframe>`;
  const iframeHostSnippet =
    `<iframe src="${publicBase ? slugHostUrl : embedPath}" title="Chat" style="position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483646;" allow="clipboard-write" loading="lazy"></iframe>`;
  return {
    slug,
    embedPath,
    embedUrl,
    slugHostPath,
    slugHostUrl,
    publicBase: publicBase || null,
    originHint,
    iframeSnippet,
    iframeHostSnippet,
  };
}

function buildAiPayload(company) {
  const provider = String(company?.ai_provider || 'anthropic').toLowerCase() === 'gemini' ? 'gemini' : 'anthropic';
  const rawModel = String(company?.ai_model || '').trim();
  const invalidGeminiModel = provider === 'gemini'
    && (!rawModel || rawModel.toLowerCase().includes('claude') || rawModel.toLowerCase() === 'gemini-1.5-flash-latest');
  const model = invalidGeminiModel ? null : (rawModel || null);
  const hasAnthropicKey = Boolean(String(company?.anthropic_api_key || '').trim());
  const hasGeminiKey = Boolean(String(company?.gemini_api_key || '').trim());
  return {
    provider,
    model,
    hasAnthropicKey,
    hasGeminiKey,
    hasElevenlabsKey: Boolean(String(company?.elevenlabs_api_key || '').trim()),
    fallbackAnthropicEnv: Boolean(process.env.ANTHROPIC_API_KEY),
    fallbackGeminiEnv: Boolean(process.env.GEMINI_API_KEY),
    fallbackElevenlabsEnv: Boolean(process.env.ELEVENLABS_API_KEY),
    fallbackAnthropicModel: process.env.ANTHROPIC_MODEL || null,
    fallbackGeminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  };
}

async function serializeCompanySettings(company) {
  const modeCatalog = getModeCatalog(company.ai_mode);
  return {
    companyId: company.company_id,
    name: company.name,
    companyName: company.name,
    chatbotName: company.display_name || '',
    displayName: company.display_name || '',
    iconUrl: (company.icon_url != null && String(company.icon_url).trim()) || null,
    greetingMessage: company.greeting_message || null,
    businessInformation: {
      businessName: company.business_name || '',
      businessDescription: company.business_description || '',
      industryType: company.business_industry_type || '',
      serviceCategories: company.business_service_categories || '',
      contactEmail: company.business_contact_email || '',
      contactPhone: company.business_contact_phone || '',
    },
    widget: {
      position: String(company.widget_position || 'right').toLowerCase() === 'left' ? 'left' : 'right',
    },
    autoTrigger: buildAutoTriggerPayload(company),
    aiMode: modeCatalog.active,
    ai: buildAiPayload(company),
    leadNotifications: {
      emailEnabled: Boolean(company.lead_email_notifications_enabled),
      email: company.lead_notification_email || null,
    },
    voice: await buildVoicePayload(company),
    escalation: {
      triggers: {
        userRequestsHuman: Boolean(company.escalation_trigger_user_requests_human),
        aiConfidenceLow: Boolean(company.escalation_trigger_ai_confidence_low),
        urgentKeywords: Boolean(company.escalation_trigger_urgent_keywords),
        angrySentiment: Boolean(company.escalation_trigger_angry_sentiment),
        highValueLead: Boolean(company.escalation_trigger_high_value_lead),
      },
      actions: {
        instantNotification: Boolean(company.escalation_action_instant_notification),
        autoScheduleMeeting: Boolean(company.escalation_action_auto_schedule_meeting),
        chatTakeoverAlert: Boolean(company.escalation_action_chat_takeover_alert),
      },
      highValueLeadScoreThreshold: Number(company.escalation_high_value_lead_score_threshold || 75),
    },
    safety: {
      blockTopicsEnabled: Boolean(company.safety_block_topics_enabled),
      blockTopics: company.safety_block_topics || '',
      preventInternalData: Boolean(company.safety_prevent_internal_data),
      restrictDatabasePriceExposure: Boolean(company.safety_restrict_database_price_exposure),
      disableCompetitorComparisons: Boolean(company.safety_disable_competitor_comparisons),
      restrictFileSharing: Boolean(company.safety_restrict_file_sharing),
    },
    language: {
      primary: normalizeLanguagePrimaryToCode(company.language_primary || 'en'),
      catalog: filterChatLanguageCatalogForAdmin(company, getLanguageCatalogForClient()),
      multiEnabled: Boolean(company.language_multi_enabled),
      autoDetectEnabled: Boolean(company.language_auto_detect_enabled),
      manualSwitchEnabled: Boolean(company.language_manual_switch_enabled),
      extraLocales: parseLanguageExtraLocalesJson(company.language_extra_locales),
    },
    adminVisibility: buildAdminVisibilityPayload(company),
    theme: mergeCompanyTheme(company.company_id, {
      primaryColor: company.theme_primary_color,
      primaryDarkColor: company.theme_primary_dark_color,
      secondaryColor: company.theme_secondary_color,
      secondaryLightColor: company.theme_secondary_light_color,
      headerBackground: company.theme_header_background,
      headerShadow: company.theme_header_shadow,
      headerTextColor: company.theme_header_text_color,
    }),
    embed: buildEmbedPayload(company),
  };
}

async function getSettingsJsonForCompany(companyId) {
  const company = await CompanyAdmin.findByCompanyId(companyId);
  if (!company) return null;
  return await serializeCompanySettings(company);
}

async function getSettings(req, res) {
  try {
    const data = await getSettingsJsonForCompany(req.adminCompanyId);
    if (!data) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('[admin settings] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function uploadCompanyIcon(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: 'Icon file is required (field name: icon).' });
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      return res.status(400).json({ error: 'Uploaded icon is empty.' });
    }

    if (file.size > ICON_UPLOAD_MAX_BYTES) {
      return res.status(400).json({ error: 'Icon must be 1MB or smaller.' });
    }

    if (!isAllowedIconMime(file)) {
      return res.status(400).json({ error: 'Only ICO, PNG, JPG, JPEG, WEBP, or SVG images are allowed.' });
    }

    const ext = resolveIconUploadExtension(file);
    if (!ext) {
      return res.status(400).json({ error: 'Only ICO, PNG, JPG, JPEG, WEBP, or SVG images are allowed.' });
    }

    const safeCompanyId = String(req.adminCompanyId || '_default').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || '_default';
    const uploadDir = path.join(__dirname, '../../../uploads/company-icons', safeCompanyId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const absolutePath = path.join(uploadDir, fileName);
    fs.writeFileSync(absolutePath, file.buffer);

    const publicUrl = `/uploads/company-icons/${encodeURIComponent(safeCompanyId)}/${encodeURIComponent(fileName)}`;
    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      icon_url: publicUrl,
    });

    return res.json({ iconUrl: publicUrl });
  } catch (err) {
    console.error('[admin settings] upload icon:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload icon.' });
  }
}

async function updateSettings(req, res) {
  try {
    const {
      companyName,
      chatbotName,
      displayName,
      iconUrl,
      greetingMessage,
      businessInformation,
      widget,
      aiMode,
      ai,
      theme,
      leadNotifications,
      voice,
      autoTrigger,
      escalation,
      safety,
      language,
    } = req.body;

    const resolvedCompanyName = companyName !== undefined ? String(companyName || '').trim() : undefined;
    if (resolvedCompanyName !== undefined && !resolvedCompanyName) {
      return res.status(400).json({ error: 'Company name cannot be empty' });
    }

    const chatbotTitle =
      chatbotName !== undefined
        ? String(chatbotName || '').trim() || null
        : displayName !== undefined
          ? String(displayName || '').trim() || null
          : undefined;
    const normalizedAiProvider = normalizeAiProvider(ai?.provider);
    const rawAiModel = ai?.model !== undefined ? String(ai.model || '').trim() : undefined;
    const normalizedAiModel = rawAiModel === undefined
      ? undefined
      : rawAiModel === ''
        ? null
        : normalizedAiProvider === 'gemini'
          ? normalizeGeminiModel(rawAiModel, process.env.GEMINI_MODEL)
          : rawAiModel;
    if (ai?.provider !== undefined && !normalizedAiProvider) {
      return res.status(400).json({ error: 'Invalid ai provider. Allowed values: anthropic, gemini' });
    }


    if (aiMode !== undefined && !isValidConversationModeId(aiMode)) {
      return res.status(400).json({ error: 'Invalid aiMode value' });
    }

    const emailEnabled = leadNotifications?.emailEnabled;
    const email = normalizeNotificationEmail(leadNotifications?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid lead notification email' });
    }
    if (emailEnabled === true && !email) {
      return res.status(400).json({ error: 'Lead notification email is required when email notifications are enabled' });
    }

    const normalizedAutoTriggerDelay = autoTrigger?.afterSeconds !== undefined
      ? clampInt(autoTrigger.afterSeconds, 0, 120, 8)
      : undefined;
    const normalizedAutoTriggerScroll = autoTrigger?.afterScrollPercent !== undefined
      ? clampInt(autoTrigger.afterScrollPercent, 0, 100, 40)
      : undefined;
    const normalizedAutoTriggerPages = normalizeSelectedPages(autoTrigger?.selectedPages);
    const normalizedAutoTriggerOpenModeInput = normalizeAutoTriggerOpenMode(autoTrigger?.openMode);
    if (autoTrigger?.openMode !== undefined && !normalizedAutoTriggerOpenModeInput) {
      return res.status(400).json({ error: 'Invalid autoTrigger openMode. Allowed values: auto, click' });
    }
    const normalizedAutoTriggerOpenMode = normalizedAutoTriggerOpenModeInput !== undefined
      ? normalizedAutoTriggerOpenModeInput
      : autoTrigger?.enabled !== undefined
        ? (Boolean(autoTrigger.enabled) ? 'auto' : 'click')
        : undefined;
    const normalizedAutoTriggerEnabled = normalizedAutoTriggerOpenMode !== undefined
      ? normalizedAutoTriggerOpenMode === 'auto'
      : undefined;

    const companyBeforeUpdate = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!companyBeforeUpdate) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const adminVisibility = buildAdminVisibilityPayload(companyBeforeUpdate);
    if (!isSettingsAccessBypassed(req)) {
      const restrictedFields = collectRestrictedAdminUpdateFields(req.body, companyBeforeUpdate, adminVisibility);
      if (restrictedFields.length) {
        return res.status(403).json({
          error: `You do not have permission to update: ${restrictedFields.join(', ')}`,
        });
      }
    }

    const companyCustomVoice = getCompanyCustomVoice(companyBeforeUpdate);

    let normalizedVoiceGender;
    if (voice?.gender !== undefined) {
      normalizedVoiceGender = normalizeVoiceGenderInput(voice.gender);
      if (!normalizedVoiceGender) {
        return res.status(400).json({ error: 'Invalid voice gender. Allowed values: male, female' });
      }
    }

    let normalizedVoiceProfile;
    if (voice?.profile !== undefined) {
      normalizedVoiceProfile = normalizeVoiceProfile(voice.profile);
      if (!normalizedVoiceProfile) {
        return res.status(400).json({ error: 'Invalid voice profile. Allowed values: professional, corporate, sales, custom' });
      }

      if (normalizedVoiceProfile === 'custom' && !companyCustomVoice) {
        return res.status(400).json({ error: 'No custom voice is trained yet. Train your voice first, then select custom profile.' });
      }
    }

    if (normalizedVoiceProfile === 'custom' && companyCustomVoice) {
      normalizedVoiceGender = companyCustomVoice.gender;
    }

    if (normalizedVoiceProfile === undefined
      && normalizeVoiceProfile(companyBeforeUpdate.voice_profile) === 'custom'
      && companyCustomVoice
      && normalizedVoiceGender !== undefined) {
      normalizedVoiceGender = companyCustomVoice.gender;
    }

    let businessInfoPatch = {};
    if (businessInformation !== undefined) {
      const bi = businessInformation && typeof businessInformation === 'object' ? businessInformation : {};
      const bizEmail = String(bi.contactEmail ?? bi.businessContactEmail ?? '').trim().toLowerCase();
      if (bizEmail && !isValidEmail(bizEmail)) {
        return res.status(400).json({ error: 'Invalid business contact email' });
      }
      let bizPhone;
      try {
        bizPhone = normalizePhoneWithCountryCode(bi.contactPhone);
      } catch (err) {
        if (err.code === 'INVALID_PHONE') {
          return res.status(400).json({ error: 'Business contact phone must include country code and contain 6 to 15 digits.' });
        }
        throw err;
      }
      businessInfoPatch = {
        business_name: String(bi.businessName || '').trim().slice(0, 255) || null,
        business_description: String(bi.businessDescription || '').trim() || null,
        business_industry_type: String(bi.industryType || '').trim().slice(0, 255) || null,
        business_service_categories: String(bi.serviceCategories || '').trim() || null,
        business_contact_email: bizEmail || null,
        business_contact_phone: bizPhone || null,
      };
    }

    let normalizedIconUrl;
    try {
      normalizedIconUrl = normalizeHttpUrl(iconUrl, { allowRelativePath: true });
    } catch (err) {
      if (err.code === 'INVALID_URL') {
        return res.status(400).json({ error: 'Icon URL must be a valid URL.' });
      }
      throw err;
    }

    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      company_name: resolvedCompanyName,
      display_name: chatbotTitle,
      icon_url: normalizedIconUrl,
      greeting_message: greetingMessage !== undefined
        ? (String(greetingMessage).trim() || null)
        : undefined,
      ...businessInfoPatch,
      widget_position: widget?.position !== undefined
        ? (String(widget.position).toLowerCase() === 'left' ? 'left' : 'right')
        : undefined,
      auto_trigger_enabled: normalizedAutoTriggerEnabled,
      auto_trigger_open_mode: normalizedAutoTriggerOpenMode,
      auto_trigger_delay_seconds: normalizedAutoTriggerDelay,
      auto_trigger_scroll_percent: normalizedAutoTriggerScroll,
      auto_trigger_only_selected_pages: autoTrigger?.onlySelectedPages !== undefined
        ? Boolean(autoTrigger.onlySelectedPages)
        : undefined,
      auto_trigger_pricing_page: autoTrigger?.onPricingPage !== undefined
        ? Boolean(autoTrigger.onPricingPage)
        : undefined,
      auto_trigger_portfolio_page: autoTrigger?.onPortfolioPage !== undefined
        ? Boolean(autoTrigger.onPortfolioPage)
        : undefined,
      auto_trigger_selected_pages: normalizedAutoTriggerPages,
      ai_mode: aiMode !== undefined ? normalizeConversationModeId(aiMode) : undefined,
      ai_provider: normalizedAiProvider !== undefined ? normalizedAiProvider : undefined,
      ai_model: normalizedAiModel,
      anthropic_api_key: ai?.anthropicApiKey !== undefined ? String(ai.anthropicApiKey || '').trim() || null : undefined,
      gemini_api_key: ai?.geminiApiKey !== undefined ? String(ai.geminiApiKey || '').trim() || null : undefined,
      elevenlabs_api_key: normalizeElevenLabsApiKeyInput(ai?.elevenlabsApiKey),
      theme_primary_color: theme?.primaryColor !== undefined ? theme.primaryColor : undefined,
      theme_primary_dark_color: theme?.primaryDarkColor !== undefined ? theme.primaryDarkColor : undefined,
      theme_secondary_color: theme?.secondaryColor !== undefined ? theme.secondaryColor : undefined,
      theme_secondary_light_color: theme?.secondaryLightColor !== undefined ? theme.secondaryLightColor : undefined,
      lead_email_notifications_enabled: emailEnabled !== undefined ? Boolean(emailEnabled) : undefined,
      lead_notification_email: email !== undefined ? email : undefined,
      voice_mode_enabled: voice?.enabled !== undefined ? Boolean(voice.enabled) : undefined,
      voice_response_enabled: voice?.responseEnabled !== undefined ? Boolean(voice.responseEnabled) : undefined,
      voice_gender: normalizedVoiceGender !== undefined ? normalizedVoiceGender : undefined,
      voice_profile: normalizedVoiceProfile !== undefined ? normalizedVoiceProfile : undefined,
      voice_ignore_emoji: voice?.ignoreEmoji !== undefined ? Boolean(voice.ignoreEmoji) : undefined,
      voice_tts_language_code: (() => {
        if (voice?.ttsLanguageCode === undefined) return undefined;
        const raw = String(voice.ttsLanguageCode || '').trim().toLowerCase();
        return raw || null;
      })(),
      escalation_trigger_user_requests_human: escalation?.triggers?.userRequestsHuman !== undefined
        ? Boolean(escalation.triggers.userRequestsHuman)
        : undefined,
      escalation_trigger_ai_confidence_low: escalation?.triggers?.aiConfidenceLow !== undefined
        ? Boolean(escalation.triggers.aiConfidenceLow)
        : undefined,
      escalation_trigger_urgent_keywords: escalation?.triggers?.urgentKeywords !== undefined
        ? Boolean(escalation.triggers.urgentKeywords)
        : undefined,
      escalation_trigger_angry_sentiment: escalation?.triggers?.angrySentiment !== undefined
        ? Boolean(escalation.triggers.angrySentiment)
        : undefined,
      escalation_trigger_high_value_lead: escalation?.triggers?.highValueLead !== undefined
        ? Boolean(escalation.triggers.highValueLead)
        : undefined,
      escalation_action_instant_notification: escalation?.actions?.instantNotification !== undefined
        ? Boolean(escalation.actions.instantNotification)
        : undefined,
      escalation_action_auto_schedule_meeting: escalation?.actions?.autoScheduleMeeting !== undefined
        ? Boolean(escalation.actions.autoScheduleMeeting)
        : undefined,
      escalation_action_chat_takeover_alert: escalation?.actions?.chatTakeoverAlert !== undefined
        ? Boolean(escalation.actions.chatTakeoverAlert)
        : undefined,
      escalation_high_value_lead_score_threshold:
        escalation?.highValueLeadScoreThreshold !== undefined
          ? Number(escalation.highValueLeadScoreThreshold)
          : undefined,
      safety_block_topics_enabled: safety?.blockTopicsEnabled !== undefined
        ? Boolean(safety.blockTopicsEnabled)
        : undefined,
      safety_block_topics: safety?.blockTopics !== undefined
        ? String(safety.blockTopics || '')
        : undefined,
      safety_prevent_internal_data: safety?.preventInternalData !== undefined
        ? Boolean(safety.preventInternalData)
        : undefined,
      safety_restrict_database_price_exposure: safety?.restrictDatabasePriceExposure !== undefined
        ? Boolean(safety.restrictDatabasePriceExposure)
        : undefined,
      safety_disable_competitor_comparisons: safety?.disableCompetitorComparisons !== undefined
        ? Boolean(safety.disableCompetitorComparisons)
        : undefined,
      safety_restrict_file_sharing: safety?.restrictFileSharing !== undefined
        ? Boolean(safety.restrictFileSharing)
        : undefined,
      language_primary:
        language?.primary !== undefined ? normalizeLanguagePrimaryToCode(language.primary) : undefined,
      language_multi_enabled: language?.multiEnabled !== undefined ? Boolean(language.multiEnabled) : undefined,
      language_auto_detect_enabled: language?.autoDetectEnabled !== undefined ? Boolean(language.autoDetectEnabled) : undefined,
      language_manual_switch_enabled: language?.manualSwitchEnabled !== undefined ? Boolean(language.manualSwitchEnabled) : undefined,
      language_extra_locales: (() => {
        if (language?.extraLocales === undefined) return undefined;
        const p =
          language?.primary !== undefined
            ? normalizeLanguagePrimaryToCode(language.primary)
            : normalizeLanguagePrimaryToCode(companyBeforeUpdate.language_primary);
        return serializeLanguageExtraLocales(
          normalizeLanguageExtraLocalesInput(language.extraLocales, p)
        );
      })(),
    });

    const updated = await getSettingsJsonForCompany(req.adminCompanyId);
    res.json(updated);
  } catch (err) {
    console.error('[admin settings] update:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getModeSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (!assertAdminModeAccess(req, res, company)) return;

    const catalog = getModeCatalog(company.ai_mode);
    res.json(filterModeCatalogForAdmin(company, catalog));
  } catch (err) {
    console.error('[admin settings] modes:', err);
    res.status(500).json({ error: err.message });
  }
}

async function previewVoice(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const customVoice = getCompanyCustomVoice(company);

    const requestedGender = normalizeVoiceGenderInput(req.body?.gender);
    if (requestedGender === null) {
      return res.status(400).json({ error: 'Invalid voice gender. Allowed values: male, female' });
    }

    const profileInputProvided = req.body?.profile !== undefined;
    const requestedProfile = profileInputProvided ? normalizeVoiceProfile(req.body.profile) : undefined;
    if (profileInputProvided && !requestedProfile) {
      return res.status(400).json({ error: 'Invalid voice profile. Allowed values: professional, corporate, sales, custom' });
    }

    let profile = requestedProfile || normalizeVoiceProfile(company.voice_profile) || 'professional';
    if (profile === 'custom' && !customVoice) {
      return res.status(400).json({ error: 'No custom voice is trained yet. Train your voice first.' });
    }

    let gender = requestedGender || normalizeVoiceGender(company.voice_gender);
    if (profile === 'custom' && customVoice) {
      gender = customVoice.gender;
    }
    const requestedPreviewLang = String(req.body?.ttsLanguageCode || '').trim().toLowerCase();

    if (!assertAdminVoiceAccess(req, res, company, {
      profile,
      gender,
      languageCode: requestedPreviewLang || company.voice_tts_language_code || null,
    })) return;

    const bodyText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const previewText = bodyText
      ? bodyText.slice(0, 260)
      : getVoicePreviewText(profile, gender, {
        customVoiceId: customVoice?.voiceId,
        customVoiceName: customVoice?.voiceName,
        customVoiceGender: customVoice?.gender,
      });

    const { detectNaturalLanguageFromText } = require('../../services/chatRules');
    const speechLang = resolveSpeechLanguageCode({
      assistantText: previewText,
      userText: '',
      primaryStored: company.language_primary,
      detectFn: detectNaturalLanguageFromText,
      voicePreferenceCode: requestedPreviewLang || company.voice_tts_language_code || null,
    });

    const voice = await synthesizeTextResponse(previewText, {
      apiKey: company?.elevenlabs_api_key || null,
      gender,
      profile,
      customVoiceId: customVoice?.voiceId,
      customVoiceName: customVoice?.voiceName,
      customVoiceGender: customVoice?.gender,
      ignoreEmoji: true,
      languageCode: speechLang || undefined,
    });

    if (!voice) {
      return res.status(503).json({ error: 'Voice preview unavailable. Check ELEVENLABS_API_KEY and voice configuration.' });
    }

    res.json({
      profile,
      gender,
      previewText,
      ...voice,
    });
  } catch (err) {
    logVoiceApiFailure('admin_voice_preview', err, { companyId: req.adminCompanyId });
    const status = Number(err?.status || 0);
    if ([400, 401, 402, 403, 404, 409, 413, 422, 429].includes(status)) {
      return res.status(status).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Voice preview failed.' });
  }
}

async function listVoices(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const customVoice = getCompanyCustomVoice(company);
    const gender = req.query.gender || null;
    const profile = req.query.profile || null;
    const search = req.query.search || null;
    const language = req.query.language || null;

    if (!assertAdminVoiceAccess(req, res, company, {
      requiresPresetList: true,
      languageCode: language || company.voice_tts_language_code || null,
    })) return;

    const voices = await getVoiceList(
      { gender, profile, search, language },
      {
        customVoice,
        apiKey: company?.elevenlabs_api_key || null,
      }
    );
    const adminVisibility = buildAdminVisibilityPayload(company);
    const filteredVoices = isSettingsAccessBypassed(req)
      ? voices
      : voices.filter((row) => isPresetVoiceAllowed(adminVisibility.voice.allowedPresetVoiceKeys, row.profileId, row.gender, language || company.voice_tts_language_code || null));
    res.json({ voices: filteredVoices });
  } catch (err) {
    console.error('[admin settings] list voices:', err);
    res.status(500).json({ error: err.message });
  }
}

async function debugVoices(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const languageCode = req.query.language || company.voice_tts_language_code || company.language_primary || 'en';
    const profile = req.query.profile || company.voice_profile || 'professional';
    const gender = req.query.gender || company.voice_gender || 'female';
    const limit = req.query.limit || 30;

    const debug = await debugVoiceSelection({
      apiKey: company?.elevenlabs_api_key || null,
      languageCode,
      profile,
      gender,
      limit,
    });

    res.json(debug);
  } catch (err) {
    console.error('[admin settings] debug voices:', err);
    res.status(500).json({ error: err.message });
  }
}

async function trainCustomVoice(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!assertAdminVoiceAccess(req, res, company, { requiresTraining: true, profile: 'custom' })) return;

    const voiceName = String(req.body?.name || '').trim();
    if (!voiceName) {
      return res.status(400).json({ error: 'Voice name is required.' });
    }

    const voiceGender = normalizeVoiceGenderInput(req.body?.gender);
    if (!voiceGender) {
      return res.status(400).json({ error: 'Please choose male or female before training your voice.' });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: 'Please upload at least one audio sample file.' });
    }

    const audioFiles = uploadedFiles.filter((file) => {
      const mime = String(file?.mimetype || '').toLowerCase();
      const name = String(file?.originalname || '').toLowerCase();
      return mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|flac|aac|mp4)$/i.test(name);
    });

    if (!audioFiles.length) {
      return res.status(400).json({ error: 'Only audio files are accepted for voice training.' });
    }

    const trainedVoice = await createCustomVoiceFromSamples({
      apiKey: company?.elevenlabs_api_key || null,
      name: voiceName,
      gender: voiceGender,
      files: audioFiles,
      description: req.body?.description,
    });

    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      voice_custom_id: trainedVoice.voiceId,
      voice_custom_name: trainedVoice.voiceName,
      voice_custom_gender: trainedVoice.gender,
      voice_profile: 'custom',
      voice_gender: trainedVoice.gender,
      voice_mode_enabled: true,
      voice_response_enabled: true,
    });

    const updatedCompany = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    res.status(201).json({
      message: 'Custom voice trained successfully.',
      trainedVoice: {
        voiceId: trainedVoice.voiceId,
        voiceName: trainedVoice.voiceName,
        gender: trainedVoice.gender,
      },
      voice: await buildVoicePayload(updatedCompany),
    });
  } catch (err) {
    console.error('[admin settings] train custom voice:', err);
    if (err.status === 400 || err.status === 402 || err.status === 413) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Failed to train custom voice.' });
  }
}

async function listActiveSessions(req, res) {
  try {
    const sessions = await CompanyAdmin.listActiveSessions(req.adminCompanyId);
    res.json({ sessions });
  } catch (err) {
    console.error('[admin settings] active sessions:', err);
    res.status(500).json({ error: err.message });
  }
}

async function logoutAllSessions(req, res) {
  try {
    await CompanyAdmin.deleteAllSessions(req.adminCompanyId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin settings] logout-all:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getSettings,
  getSettingsJsonForCompany,
  updateSettings,
  uploadCompanyIcon,
  previewVoice,
  listVoices,
  debugVoices,
  trainCustomVoice,
  getModeSettings,
  listActiveSessions,
  logoutAllSessions,
};
