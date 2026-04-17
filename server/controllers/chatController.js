const { randomUUID } = require('crypto');
const { sendMessage: sendAnthropicMessage } = require('../services/anthropicService');
const { sendMessage: sendGeminiMessage } = require('../services/geminiService');
const { captureLeadFromConversation } = require('../services/leadCaptureService');
const { sendNewLeadNotification } = require('../services/leadNotificationService');
const {
  record: recordActiveVisitor,
  recordMessage: recordLiveMessage,
  broadcastAlert,
  isOperatorActive,
} = require('../services/activeVisitorsService');
const { evaluateEscalation } = require('../services/escalationService');
const { appendChatLog, appendSystemLog } = require('../services/adminLogStore');
const { buildVoiceApiErrorMeta, buildHttpClientErrorMeta, logVoiceApiFailure } = require('../services/voiceApiErrorLog');
const { add: addSupportRequest, isSupportRequest } = require('../services/supportRequestsStore');
const {
  normalizeVoiceGender,
  normalizeVoiceProfile,
  resolveVoiceSelection,
  synthesizeTextResponse,
} = require('../services/elevenlabsService');
const {
  parseLanguageExtraLocalesJson,
  resolveSpeechLanguageCode,
  normalizeLanguagePrimaryToCode,
} = require('../services/supportedChatLanguages');
const {
  detectNaturalLanguageFromText,
  inferCompanyProfile,
  inferTrainingContentLanguageHint,
} = require('../services/chatRules');
const { buildAdminVisibilityPayload } = require('../services/adminSettingsAccess');
const { findProjectLinks, loadCompanyContext } = require('../services/trainingLoader');
const { normalizeGeminiModel } = require('../services/geminiModelService');
const { extractClientIp, lookupIpGeo } = require('../utils/ipGeo');
const pool = require('../db/index');
const Chatbot = require('../models/Chatbot');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const CompanyAdmin = require('../admin/models/CompanyAdmin');
const liveAvatar = require('../services/liveAvatarService');

const LIVEAVATAR_SANDBOX_AVATAR_ID = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';
const LIVEAVATAR_SANDBOX_AVATAR_NAME = 'Wayne';

const PROJECT_LINK_INTENT_RE = /\b(project|projects|portfolio|case\s*stud(y|ies)|have\s+you\s+done|similar\s+app|related\s+app|i\s+want\s+to\s+develop|want\s+to\s+develop|developed?)\b/i;
const CHAT_CONTEXT_MAX_MESSAGES = Math.max(2, parseInt(process.env.CHAT_CONTEXT_MAX_MESSAGES || '18', 10));
const CHAT_CONTEXT_MAX_CHARS = Math.max(2000, parseInt(process.env.CHAT_CONTEXT_MAX_CHARS || '18000', 10));
const CHAT_MESSAGE_MAX_CHARS = Math.max(500, parseInt(process.env.CHAT_MESSAGE_MAX_CHARS || '6000', 10));

// In-memory dedup cache for idempotent chat requests (keyed by client idempotency key)
const _recentIdempotencyKeys = new Map();
const IDEMPOTENCY_TTL_MS = 60_000; // 60s
const IDEMPOTENCY_MAX_SIZE = 2000;

// Track idempotency keys whose user message has already been saved to DB (prevents duplicate inserts on retry)
const _savedMessageKeys = new Map();

function pruneIdempotencyCache() {
  if (_recentIdempotencyKeys.size <= IDEMPOTENCY_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of _recentIdempotencyKeys) {
    if (now - entry.time > IDEMPOTENCY_TTL_MS) _recentIdempotencyKeys.delete(key);
  }
  for (const [key, entry] of _savedMessageKeys) {
    if (now - entry.time > IDEMPOTENCY_TTL_MS) _savedMessageKeys.delete(key);
  }
}

function shouldReturnProjectLinks(query = '') {
  return PROJECT_LINK_INTENT_RE.test(String(query || ''));
}

function buildProjectLinksReply(query = '', links = []) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const intro = /fuel/i.test(String(query || ''))
    ? 'Yes, we have done fuel delivery related projects. Here are relevant project links:'
    : 'Here are relevant projects with links:';
  const lines = links.map((item) => `- ${item.title}: ${item.url}`);
  return [intro, '', ...lines].join('\n');
}

function buildChatRequestId() {
  try {
    return randomUUID();
  } catch {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizeMessageRole(role) {
  return String(role || '').trim().toLowerCase() === 'assistant' ? 'assistant' : 'user';
}

function normalizeIncomingMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((msg) => {
      const content = String(msg?.content ?? '').replace(/\u0000/g, '').trim();
      if (!content) return null;
      return {
        role: normalizeMessageRole(msg?.role),
        content: content.length > CHAT_MESSAGE_MAX_CHARS ? content.slice(0, CHAT_MESSAGE_MAX_CHARS) : content,
      };
    })
    .filter(Boolean);
}

function summarizeConversation(messages = []) {
  return {
    count: Array.isArray(messages) ? messages.length : 0,
    chars: Array.isArray(messages)
      ? messages.reduce((sum, msg) => sum + String(msg?.content || '').length, 0)
      : 0,
  };
}

function trimMessagesForAi(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const kept = [];
  let totalChars = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const content = String(msg?.content || '').trim();
    if (!content) continue;
    const normalized = {
      role: normalizeMessageRole(msg?.role),
      content,
    };
    const nextChars = totalChars + normalized.content.length;
    if (kept.length >= CHAT_CONTEXT_MAX_MESSAGES) break;
    if (kept.length > 0 && nextChars > CHAT_CONTEXT_MAX_CHARS) break;
    kept.push(normalized);
    totalChars = nextChars;
  }

  if (!kept.length) {
    const latest = messages[messages.length - 1];
    return latest ? [{
      role: normalizeMessageRole(latest.role),
      content: String(latest.content || '').trim().slice(0, CHAT_MESSAGE_MAX_CHARS),
    }] : [];
  }

  return kept.reverse();
}

function deriveChatErrorStatus(err) {
  if (String(err?.code || '').toUpperCase() === 'ETIMEDOUT') return 504;
  const upstreamStatus = Number(err?.status || err?.httpStatus || err?.response?.status);
  if (upstreamStatus === 429) return 503;
  if (upstreamStatus >= 500 && upstreamStatus < 600) return 502;
  return 500;
}

function hasProviderApiKey(provider, config = {}) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'gemini') {
    return Boolean(String(config?.geminiApiKey || process.env.GEMINI_API_KEY || '').trim());
  }
  return Boolean(String(config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '').trim());
}

async function trackApiUsage({
  companyId,
  sessionId = null,
  provider,
  category,
  model = null,
  requestContext = null,
  latencyMs = null,
  success = true,
  errorMessage = null,
  metadata = null,
}) {
  try {
    await pool.query(
      `INSERT INTO api_usage_logs (
         company_id, session_id, api_provider, api_category, model, request_context, latency_ms, success, error_message, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        companyId,
        sessionId,
        String(provider || 'unknown'),
        String(category || 'unknown'),
        model ? String(model) : null,
        requestContext ? String(requestContext) : null,
        Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
        Boolean(success),
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch {
    // Tracking must never block chat responses.
  }
}

function resolveEffectiveModel(provider, configuredModel) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const explicitModel = String(configuredModel || '').trim();
  if (explicitModel) return explicitModel;
  if (normalizedProvider === 'gemini') {
    return normalizeGeminiModel(configuredModel, process.env.GEMINI_MODEL);
  }
  if (normalizedProvider === 'anthropic') {
    return String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514').trim();
  }
  if (normalizedProvider === 'elevenlabs') {
    return String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();
  }
  return null;
}

function buildLanguageConfig(chatbot = null) {
  return {
    primary: chatbot?.language_primary || 'en',
    multiEnabled: Boolean(chatbot?.language_multi_enabled),
    autoDetectEnabled: chatbot?.language_auto_detect_enabled !== false,
    manualSwitchEnabled: Boolean(chatbot?.language_manual_switch_enabled),
    extraLocales: parseLanguageExtraLocalesJson(chatbot?.language_extra_locales),
  };
}

function pickConfiguredBusinessInfo(chatbot) {
  if (!chatbot) return null;
  const businessName = String(chatbot.business_name || '').trim();
  const businessDescription = String(chatbot.business_description || '').trim();
  const industryType = String(chatbot.business_industry_type || '').trim();
  const serviceCategories = String(chatbot.business_service_categories || '').trim();
  const contactEmail = String(chatbot.business_contact_email || '').trim();
  const contactPhone = String(chatbot.business_contact_phone || '').trim();
  if (!businessName && !businessDescription && !industryType && !serviceCategories && !contactEmail && !contactPhone) {
    return null;
  }
  return {
    businessName: businessName || undefined,
    businessDescription: businessDescription || undefined,
    industryType: industryType || undefined,
    serviceCategories: serviceCategories || undefined,
    contactEmail: contactEmail || undefined,
    contactPhone: contactPhone || undefined,
  };
}

function buildVoiceConfig(chatbot = null) {
  const adminVisibility = buildAdminVisibilityPayload(chatbot);
  return {
    enabled: Boolean(chatbot?.voice_mode_enabled) && Boolean(adminVisibility.voice.enableVoiceMode),
    elevenlabsApiKey: chatbot?.elevenlabs_api_key || null,
    responseEnabled: Boolean(chatbot?.voice_response_enabled !== false) && Boolean(adminVisibility.voice.enableVoiceResponse),
    gender: normalizeVoiceGender(chatbot?.voice_gender),
    profile: normalizeVoiceProfile(chatbot?.voice_profile) || 'professional',
    customVoiceId: chatbot?.voice_custom_id || null,
    customVoiceName: chatbot?.voice_custom_name || null,
    customVoiceGender: chatbot?.voice_custom_gender || null,
    ignoreEmoji: Boolean(chatbot?.voice_ignore_emoji) && Boolean(adminVisibility.voice.ignoreEmoji),
  };
}

async function synthesizeCompanyVoice({ chatbot, aiLanguageConfig, voiceConfig, assistantText, userText = '' }) {
  // Assistant reply TTS follows "voice response" only; voice mode (mic) is independent.
  if (!voiceConfig?.responseEnabled) {
    return null;
  }

  const speechLang = resolveSpeechLanguageCode({
    assistantText,
    userText,
    primaryStored: aiLanguageConfig?.primary || 'en',
    detectFn: detectNaturalLanguageFromText,
    voicePreferenceCode: chatbot?.voice_tts_language_code || null,
  });

  return synthesizeTextResponse(assistantText, {
    apiKey: voiceConfig.elevenlabsApiKey,
    gender: voiceConfig.gender,
    profile: voiceConfig.profile,
    customVoiceId: voiceConfig.customVoiceId,
    customVoiceName: voiceConfig.customVoiceName,
    customVoiceGender: voiceConfig.customVoiceGender,
    ignoreEmoji: voiceConfig.ignoreEmoji,
    languageCode: speechLang || undefined,
  });
}

/**
 * POST /api/chat/message
 * Body: { messages, companyId?, sessionId? }
 * Returns: { content, sessionId }
 */
async function postMessage(req, res) {
  const requestId = buildChatRequestId();
  let companyId = '_default';
  let sid = null;
  let stage = 'start';
  let originalConversation = [];
  let aiConversation = [];
  let userMsg = null;
  const requestStartedAt = Date.now();
  let ipGeoPromise = null;
  try {
    const clientIp = extractClientIp(req);
    ipGeoPromise = lookupIpGeo(clientIp).catch(() => ({ country: '', cityState: '' }));

    const {
      messages,
      companyId: requestCompanyId = '_default',
      sessionId,
      clientTime,
      clientTimezone,
      skipVoice,
    } = req.body || {};
    companyId = requestCompanyId;
    stage = 'validate_request';

    // Idempotency: if client sends an idempotencyKey, return cached response for duplicates.
    const clientIdempotencyKey = req.body?.idempotencyKey;
    if (clientIdempotencyKey) {
      const cached = _recentIdempotencyKeys.get(clientIdempotencyKey);
      if (cached && Date.now() - cached.time < IDEMPOTENCY_TTL_MS) {
        return res.json(cached.response);
      }
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    originalConversation = normalizeIncomingMessages(messages);
    if (!originalConversation.length) {
      return res.status(400).json({ error: 'messages array must include at least one non-empty message' });
    }

    userMsg = originalConversation[originalConversation.length - 1];
    if (userMsg.role !== 'user') {
      return res.status(400).json({ error: 'last message must be a user message' });
    }

    aiConversation = trimMessagesForAi(originalConversation);
    sid = sessionId || null;
    let selectedModeId = null;
    let safetyConfig = {};
    let escalationConfig = {};
    let aiConfig = {
      provider: 'anthropic',
      model: null,
      anthropicApiKey: null,
      geminiApiKey: null,
      assistantName: null,
      language: {
        primary: 'en',
        multiEnabled: false,
        autoDetectEnabled: true,
        manualSwitchEnabled: false,
        extraLocales: [],
      },
    };
    let voiceConfig = {
      enabled: false,
      gender: 'female',
      profile: 'professional',
      customVoiceId: null,
      customVoiceName: null,
      customVoiceGender: null,
    };
    let chatbot = null;

    // Persist pre-response data (non-fatal if DB is unavailable)
    try {
      stage = 'db_prewrite';
      chatbot = await Chatbot.findByCompanyId(companyId);
      if (!chatbot) {
        await Chatbot.findOrCreate(companyId);
        chatbot = await Chatbot.findByCompanyId(companyId);
      }
      selectedModeId = chatbot?.ai_mode || null;
      aiConfig = {
        provider: String(chatbot?.ai_provider || 'anthropic').toLowerCase(),
        model: chatbot?.ai_model || null,
        anthropicApiKey: chatbot?.anthropic_api_key || null,
        geminiApiKey: chatbot?.gemini_api_key || null,
        assistantName: String(chatbot?.display_name || '').trim() || null,
        language: buildLanguageConfig(chatbot),
      };

      safetyConfig = {
        blockTopicsEnabled: Boolean(chatbot?.safety_block_topics_enabled),
        blockTopics: chatbot?.safety_block_topics || '',
        preventInternalData: chatbot?.safety_prevent_internal_data !== false,
        restrictDatabasePriceExposure: chatbot?.safety_restrict_database_price_exposure !== false,
        disableCompetitorComparisons: chatbot?.safety_disable_competitor_comparisons !== false,
        restrictFileSharing: chatbot?.safety_restrict_file_sharing !== false,
      };

      escalationConfig = {
        triggers: {
          userRequestsHuman: chatbot?.escalation_trigger_user_requests_human !== false,
          aiConfidenceLow: chatbot?.escalation_trigger_ai_confidence_low !== false,
          urgentKeywords: chatbot?.escalation_trigger_urgent_keywords !== false,
          angrySentiment: chatbot?.escalation_trigger_angry_sentiment !== false,
          highValueLead: chatbot?.escalation_trigger_high_value_lead !== false,
        },
        actions: {
          instantNotification: chatbot?.escalation_action_instant_notification !== false,
          autoScheduleMeeting: chatbot?.escalation_action_auto_schedule_meeting === true,
          chatTakeoverAlert: chatbot?.escalation_action_chat_takeover_alert !== false,
        },
        highValueLeadScoreThreshold: chatbot?.escalation_high_value_lead_score_threshold || 75,
      };

      voiceConfig = buildVoiceConfig(chatbot);

      // Deduplicate on retry: if this idempotencyKey already created a session and saved the
      // user message (first attempt succeeded at DB but AI generation failed), reuse that
      // session and skip the duplicate insert.
      const alreadySaved = clientIdempotencyKey && _savedMessageKeys.get(clientIdempotencyKey);
      if (alreadySaved && Date.now() - alreadySaved.time < IDEMPOTENCY_TTL_MS) {
        // Reuse the session created on the first attempt
        sid = alreadySaved.sid;
      } else {
        if (!sid) {
          const { id } = await ChatSession.create(companyId);
          sid = id;
        }

        // Skip duplicate save when retrying after operator hand-back
        if (!req.body?.operatorRetry) {
          await ChatMessage.create(sid, 'user', userMsg.content);
        }
        if (clientIdempotencyKey) {
          _savedMessageKeys.set(clientIdempotencyKey, { time: Date.now(), sid });
          pruneIdempotencyCache();
        }
      }

      const session = await ChatSession.findById(sid);
      if (session?.title === 'New Chat') {
        const title = userMsg.content.replace(/\s+/g, ' ').trim().slice(0, 80);
        await ChatSession.updateTitle(sid, title);
      } else {
        await ChatSession.touch(sid);
      }

      if (chatbot?.agent_paused || chatbot?.is_suspended) {
        stage = 'paused_reply';
        const pausedMessage = chatbot?.is_suspended
          ? 'This chatbot is temporarily unavailable because the company is suspended. Please contact support for assistance.'
          : 'Our AI agent is currently paused. Please leave your name and contact details, and we will get back to you shortly.';
        await ChatMessage.create(sid, 'assistant', pausedMessage);

        let pausedVoice = null;
        if (voiceConfig.responseEnabled && !skipVoice) {
          try {
            pausedVoice = await synthesizeCompanyVoice({
              chatbot,
              aiLanguageConfig: aiConfig.language,
              voiceConfig,
              assistantText: pausedMessage,
              userText: userMsg?.content || '',
            });
          } catch (voiceErr) {
            logVoiceApiFailure('paused_agent_reply', voiceErr, { companyId, sessionId: sid });
          }
        }

        return res.json({
          content: pausedMessage,
          sessionId: sid,
          voice: pausedVoice,
          requestId,
          createdAt: new Date().toISOString(),
          provider: 'system',
        });
      }

      // Per-session: if admin is operating this chat, suppress AI response
      if (sid && await isOperatorActive(companyId, sid)) {
        stage = 'operator_active';
        // Save user message to live view but do NOT generate AI response
        recordLiveMessage(
          companyId,
          sid,
          'user',
          userMsg?.content,
          req.headers['x-page-url'] || req.headers.referer || req.body.pageUrl
        );
        return res.json({
          content: '',
          sessionId: sid,
          requestId,
          createdAt: new Date().toISOString(),
          provider: 'operator',
          operatorActive: true,
        });
      }

      recordLiveMessage(
        companyId,
        sid,
        'user',
        userMsg?.content,
        req.headers['x-page-url'] || req.headers.referer || req.body.pageUrl
      );

      if (isSupportRequest(userMsg.content)) {
        addSupportRequest(companyId, { sessionId: sid, message: userMsg.content });
        broadcastAlert(companyId, {
          kind: 'support_request',
          message: 'Support requested',
          link: '/admin/support-requests',
        }).catch(() => {});
      }
    } catch (dbErr) {
      console.error('[chat] DB pre-write (non-fatal):', dbErr.message);
      appendChatLog('error', `Chat DB pre-write: ${dbErr.message}`, { sessionId: sid, companyId });
    }

    let response = '';
    const configuredBusinessInfo = pickConfiguredBusinessInfo(chatbot);
    let aiResponseMs = 0;
    let usedAiProvider = aiConfig.provider;
    const temporalParts = [`Current server datetime (ISO 8601 UTC): ${new Date().toISOString()}`];
    const safeClientTime = String(clientTime || '').trim();
    if (safeClientTime) {
      temporalParts.push(`Client-reported datetime: ${safeClientTime}`);
    }
    const safeClientTimezone = String(clientTimezone || '').trim();
    if (safeClientTimezone) {
      temporalParts.push(`Client timezone: ${safeClientTimezone}`);
    }
    const temporalContext = temporalParts.join('\n');
    if (shouldReturnProjectLinks(userMsg?.content)) {
      const matchedLinks = findProjectLinks(companyId, userMsg?.content || '', { max: 50 });
      if (matchedLinks.length > 0) {
        response = buildProjectLinksReply(userMsg?.content || '', matchedLinks);
      }
    }

    if (!response) {
      stage = 'ai_generation';
      const aiStartedAt = Date.now();
      const primaryProvider = aiConfig.provider === 'gemini' ? 'gemini' : 'anthropic';
      const fallbackProvider = primaryProvider === 'gemini' ? 'anthropic' : 'gemini';
      const primaryHasKey = hasProviderApiKey(primaryProvider, aiConfig);
      const fallbackHasKey = hasProviderApiKey(fallbackProvider, aiConfig);
      const providersToTry = primaryHasKey
        ? [primaryProvider]
        : fallbackHasKey
          ? [fallbackProvider]
          : [primaryProvider];

      let lastProviderError = null;
      for (let providerIndex = 0; providerIndex < providersToTry.length; providerIndex += 1) {
        const provider = providersToTry[providerIndex];
        const modelForProvider = provider === primaryProvider ? aiConfig.model : null;
        const effectiveAiModel = resolveEffectiveModel(provider, modelForProvider);
        const providerStartedAt = Date.now();

        try {
          response = provider === 'gemini'
            ? await sendGeminiMessage(companyId, aiConversation, {
              modeId: selectedModeId,
              safetyConfig,
              model: modelForProvider,
              apiKey: aiConfig.geminiApiKey,
              assistantName: aiConfig.assistantName,
              languageConfig: aiConfig.language,
              configuredBusinessInfo,
              temporalContext,
            })
            : await sendAnthropicMessage(companyId, aiConversation, {
              modeId: selectedModeId,
              safetyConfig,
              model: modelForProvider,
              apiKey: aiConfig.anthropicApiKey,
              assistantName: aiConfig.assistantName,
              languageConfig: aiConfig.language,
              configuredBusinessInfo,
              temporalContext,
            });

          await trackApiUsage({
            companyId,
            sessionId: sid,
            provider,
            category: 'chat',
            model: effectiveAiModel,
            requestContext: 'training_loader_context',
            latencyMs: Date.now() - providerStartedAt,
            success: true,
            metadata: {
              modeId: selectedModeId || null,
              fallbackFrom: provider === primaryProvider ? null : primaryProvider,
            },
          });

          usedAiProvider = provider;
          if (provider !== primaryProvider) {
            appendSystemLog('warn', 'Primary AI provider failed, fallback provider used', {
              companyId,
              sessionId: sid || undefined,
              requestId,
              primaryProvider,
              fallbackProvider: provider,
              primaryError: lastProviderError?.message || undefined,
            });
          }
          break;
        } catch (providerErr) {
          lastProviderError = providerErr;
          await trackApiUsage({
            companyId,
            sessionId: sid,
            provider,
            category: 'chat',
            model: effectiveAiModel,
            requestContext: 'training_loader_context',
            latencyMs: Date.now() - providerStartedAt,
            success: false,
            errorMessage: providerErr?.message || 'AI call failed',
            metadata: {
              modeId: selectedModeId || null,
              fallbackAttempt: provider !== primaryProvider,
            },
          });

          const hasAnotherProvider = providerIndex < providersToTry.length - 1;
          if (hasAnotherProvider) {
            appendSystemLog('warn', 'Primary AI provider unavailable, using fallback provider with configured key', {
              companyId,
              sessionId: sid || undefined,
              requestId,
              primaryProvider: provider,
              fallbackProvider: providersToTry[providerIndex + 1],
              error: providerErr?.message || undefined,
            });
            continue;
          }
          throw providerErr;
        }
      }

      if (!response && lastProviderError) {
        throw lastProviderError;
      }

      aiResponseMs = Date.now() - aiStartedAt;
    }

    // Mid-response check: if operator joined while AI was generating, discard AI response
    if (sid && await isOperatorActive(companyId, sid)) {
      return res.json({
        content: '',
        sessionId: sid,
        requestId,
        createdAt: new Date().toISOString(),
        provider: 'operator',
        operatorActive: true,
      });
    }

    let voice = null;

    if (voiceConfig.responseEnabled && !skipVoice) {
      try {
        stage = 'voice_synthesis';
        const voiceStartedAt = Date.now();
        voice = await synthesizeCompanyVoice({
          chatbot,
          aiLanguageConfig: aiConfig.language,
          voiceConfig,
          assistantText: response,
          userText: userMsg?.content || '',
        });
        if (voice) {
          await trackApiUsage({
            companyId,
            sessionId: sid,
            provider: 'elevenlabs',
            category: 'voice',
            model: resolveEffectiveModel('elevenlabs', null),
            requestContext: 'assistant_reply_tts',
            latencyMs: Date.now() - voiceStartedAt,
            success: true,
            metadata: { profile: voice.profile || null, voiceId: voice.voiceId || null },
          });
        }
        if (!voice && process.env.ELEVENLABS_API_KEY) {
          appendChatLog('warn', 'Voice synthesis returned no audio (text may be empty after sanitization)', { sessionId: sid, companyId });
        }
      } catch (voiceErr) {
        logVoiceApiFailure('assistant_reply_tts', voiceErr, { companyId, sessionId: sid });
        await trackApiUsage({
          companyId,
          sessionId: sid,
          provider: 'elevenlabs',
          category: 'voice',
          model: resolveEffectiveModel('elevenlabs', null),
          requestContext: 'assistant_reply_tts',
          success: false,
          errorMessage: voiceErr?.message || 'Voice synthesis failed',
          metadata: { voiceError: buildVoiceApiErrorMeta(voiceErr) },
        });
      }
    }

    if (sid) {
      try {
        stage = 'assistant_persist';
        await ChatMessage.create(sid, 'assistant', response);
        recordLiveMessage(companyId, sid, 'assistant', response, req.headers['x-page-url'] || req.headers.referer || req.body.pageUrl);
      } catch (dbErr) {
        console.error('[chat] DB post-write (non-fatal):', dbErr.message);
        appendChatLog('error', `Chat DB post-write: ${dbErr.message}`, { sessionId: sid, companyId });
      }

      let leadCaptureResult = null;
      try {
        stage = 'lead_capture';
        const geo = await ipGeoPromise;
        leadCaptureResult = await captureLeadFromConversation({
          companyId,
          sessionId: sid,
          messages: [...originalConversation, { role: 'assistant', content: response }],
          requestMeta: {
            referer: req.headers.referer,
            origin: req.headers.origin,
            pageUrl: req.headers['x-page-url'],
            userAgent: req.headers['user-agent'],
            ipAddress: clientIp,
            ipCountry: geo.country,
            ipCityState: geo.cityState,
          },
        });

        if (leadCaptureResult?.captured && leadCaptureResult?.inserted && leadCaptureResult?.lead) {
          // BACKGROUND NOTIFICATION (do not await SMTP)
          sendNewLeadNotification({ companyId, lead: leadCaptureResult.lead }).catch((notifyErr) => {
            console.error('[lead-notify] non-fatal:', notifyErr.message);
          });
          
          try {
            const lead = leadCaptureResult.lead;
            const meetingRequested = (lead?.ai_detected_intent || '') === 'meeting_booking';
            // BACKGROUND BROADCAST
            broadcastAlert(companyId, {
              kind: 'lead_captured',
              meetingRequested,
              message: meetingRequested ? 'Meeting requested — new lead captured' : 'New lead captured',
              link: '/admin/leads',
            }).catch(() => {});
          } catch (alertErr) {
            /* ignore */
          }
        }
      } catch (leadErr) {
        console.error('[lead-capture] non-fatal:', leadErr.message);
        appendChatLog('warn', `Lead capture: ${leadErr.message}`, { sessionId: sid, companyId });
      }

      // 4.5.10 Escalation Settings
      try {
        stage = 'escalation';
        const leadScore = leadCaptureResult?.lead?.lead_score ?? null;
        const escalation = evaluateEscalation({
          companyId,
          sessionId: sid,
          userText: userMsg?.content,
          responseText: response,
          leadScore,
          config: escalationConfig,
        });

        if (escalation?.shouldEscalate && Array.isArray(escalation.alerts)) {
          for (const alert of escalation.alerts) {
            broadcastAlert(companyId, alert).catch(() => {});
          }
        }
      } catch (escErr) {
        // Escalation should never break chat responses
        console.error('[escalation] non-fatal:', escErr.message);
      }
    }

    stage = 'respond';
    const originalMetrics = summarizeConversation(originalConversation);
    const aiMetrics = summarizeConversation(aiConversation);
    appendChatLog('info', 'AI response generated', {
      category: 'notification',
      companyId,
      sessionId: sid,
      requestId,
        aiProvider: usedAiProvider,
      aiResponseMs,
        totalRequestMs: Date.now() - requestStartedAt,
        serverTimeIso: new Date().toISOString(),
        originalMessageCount: originalMetrics.count,
        aiMessageCount: aiMetrics.count,
        originalInputChars: originalMetrics.chars,
        aiInputChars: aiMetrics.chars,
        historyTrimmed: originalMetrics.count !== aiMetrics.count || originalMetrics.chars !== aiMetrics.chars,
      });
    const responsePayload = { content: response, sessionId: sid, voice, requestId, createdAt: new Date().toISOString(), provider: usedAiProvider };
    if (clientIdempotencyKey) {
      _recentIdempotencyKeys.set(clientIdempotencyKey, { time: Date.now(), response: responsePayload });
      pruneIdempotencyCache();
    }
    res.json(responsePayload);
  } catch (err) {
    const message = err?.message || 'Failed to get AI response';
    const originalMetrics = summarizeConversation(originalConversation);
    const aiMetrics = summarizeConversation(aiConversation);
    console.error(`[chat] error [${requestId}] stage=${stage}:`, err);
    const httpMeta = buildHttpClientErrorMeta(err);
    const statusCode = deriveChatErrorStatus(err);
    try {
      appendSystemLog('error', `Chat message API error [${requestId}] stage=${stage}: ${message}`, {
        companyId,
        sessionId: sid || undefined,
        requestId,
        stage,
        pageUrl: req.headers['x-page-url'] || req.body?.pageUrl || req.headers.referer || undefined,
        originalMessageCount: originalMetrics.count || undefined,
        aiMessageCount: aiMetrics.count || undefined,
        originalInputChars: originalMetrics.chars || undefined,
        aiInputChars: aiMetrics.chars || undefined,
        historyTrimmed: originalMetrics.count !== aiMetrics.count || originalMetrics.chars !== aiMetrics.chars || undefined,
        ...httpMeta,
      });
    } catch (logErr) {
      console.error('[chat] appendSystemLog failed:', logErr);
    }
    if (res.headersSent) return;
    res.status(statusCode).json({ error: message, requestId, stage });
  }
}

/**
 * POST /api/chat/client-error
 * Public endpoint: widget / app report when the user sees the generic technical-issue message.
 * Logs to admin chat log + stderr so operators can see network/HTTP failures that never hit postMessage.
 */
function reportClientChatFailure(req, res) {
  try {
    const body = req.body || {};
    const companyId = String(body.companyId || '').trim() || '_unknown';
    const sessionId = body.sessionId ? String(body.sessionId).trim() : null;
    const reason = String(body.reason || 'unknown').slice(0, 4000);
    const detail = body.detail ? String(body.detail).slice(0, 12000) : '';
    const pageUrl = body.pageUrl ? String(body.pageUrl).slice(0, 2000) : '';
    const source = body.source ? String(body.source).slice(0, 80) : 'client';
    const httpStatusRaw = body.httpStatus;
    const httpStatus = httpStatusRaw != null && httpStatusRaw !== '' ? Number(httpStatusRaw) : undefined;
    const errorName = body.errorName ? String(body.errorName).slice(0, 120) : undefined;
    const networkError = Boolean(body.networkError);
    const embedIframePage = body.embedIframePage === true;

    let serverResponseBody = body.serverResponseBody;
    if (typeof serverResponseBody === 'string' && serverResponseBody.length) {
      try {
        serverResponseBody = JSON.parse(serverResponseBody);
      } catch {
        serverResponseBody = { raw: serverResponseBody.slice(0, 12000) };
      }
    }
    if (serverResponseBody != null && typeof serverResponseBody === 'object') {
      const s = JSON.stringify(serverResponseBody);
      if (s.length > 16000) {
        serverResponseBody = { _truncated: true, preview: s.slice(0, 16000) };
      }
    }

    const requestId =
      body.requestId ? String(body.requestId).slice(0, 120)
        : (serverResponseBody && typeof serverResponseBody === 'object' && serverResponseBody.requestId
          ? String(serverResponseBody.requestId).slice(0, 120)
          : undefined);
    const serverStage =
      body.serverStage ? String(body.serverStage).slice(0, 120)
        : (serverResponseBody && typeof serverResponseBody === 'object' && serverResponseBody.stage
          ? String(serverResponseBody.stage).slice(0, 120)
          : undefined);
    const statusPart = Number.isFinite(httpStatus) ? ` (HTTP ${httpStatus})` : '';
    const requestPart = requestId ? ` [${requestId}]` : '';
    const line = `Client reported chat failure [${source}]${statusPart}${requestPart}: ${reason}`;

    const meta = {
      companyId,
      sessionId: sessionId || undefined,
      requestId: requestId || undefined,
      serverStage: serverStage || undefined,
      httpStatus: Number.isFinite(httpStatus) ? httpStatus : undefined,
      pageUrl: pageUrl || undefined,
      clientStack: detail || undefined,
      source,
      errorName: errorName || undefined,
      networkError: networkError || undefined,
      embedIframePage: embedIframePage || undefined,
      serverResponseBody: serverResponseBody != null ? serverResponseBody : undefined,
    };

    console.error(`[chat] ${line}`, meta);

    appendSystemLog('error', line, meta);

    res.json({ ok: true });
  } catch (e) {
    console.error('[chat] client-error handler failed:', e);
    res.status(500).json({ ok: false });
  }
}

/**
 * POST /api/chat/ping
 * Body: { companyId, sessionId?, pageUrl? }
 * Heartbeat for active visitor tracking. Call periodically from widget/app.
 */
async function ping(req, res) {
  try {
    const { companyId, sessionId, pageUrl } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    recordActiveVisitor(companyId, sessionId || null, pageUrl || null, false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[chat] ping:', err);
    res.status(500).json({ error: err.message || 'Ping failed' });
  }
}

/**
 * POST /api/chat/voice
 * Body: { companyId, sessionId?, messageIndex?, text?, userText? }
 * Returns: { voice }
 */
async function synthesizeMessageVoice(req, res) {
  try {
    const { companyId = '_default', sessionId, messageIndex, text, userText } = req.body || {};
    const normalizedIndex = Number(messageIndex);
    const directText = String(text || '').trim();
    const hasSessionBackedTarget = Boolean(sessionId) && Number.isInteger(normalizedIndex) && normalizedIndex >= 0;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    let chatbot = await Chatbot.findByCompanyId(companyId);
    if (!chatbot) {
      await Chatbot.findOrCreate(companyId);
      chatbot = await Chatbot.findByCompanyId(companyId);
    }
    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    let assistantText = '';
    let resolvedUserText = String(userText || '').trim();

    if (hasSessionBackedTarget) {
      const session = await ChatSession.findById(sessionId);
      if (!session || session.company_id !== companyId) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const rows = await ChatMessage.listBySession(sessionId);
      const targetMessage = rows[normalizedIndex];

      if (targetMessage?.role === 'assistant') {
        assistantText = String(targetMessage.content || '').trim();
      } else if (directText) {
        // Widget greetings can be rendered locally before they exist in chat_messages.
        assistantText = directText;
      } else {
        return res.status(404).json({ error: 'Assistant message not found' });
      }

      if (!resolvedUserText) {
        const priorUserMessage = rows
          .slice(0, Math.max(0, normalizedIndex))
          .reverse()
          .find((message) => message.role === 'user' && String(message.content || '').trim());
        resolvedUserText = String(priorUserMessage?.content || '').trim();
      }
    } else {
      assistantText = directText;
      if (!assistantText) {
        return res.status(400).json({ error: 'Provide sessionId + messageIndex or direct text' });
      }
    }

    if (!assistantText) {
      return res.status(400).json({ error: 'Assistant message is empty' });
    }

    const aiLanguageConfig = buildLanguageConfig(chatbot);
    const voiceConfig = buildVoiceConfig(chatbot);
    if (!voiceConfig.responseEnabled) {
      return res.status(409).json({ error: 'Voice responses are disabled for this chatbot' });
    }

    const voice = await synthesizeCompanyVoice({
      chatbot,
      aiLanguageConfig,
      voiceConfig,
      assistantText,
      userText: resolvedUserText,
    });

    if (!voice) {
      return res.status(503).json({ error: 'Voice synthesis unavailable for this message' });
    }

    res.json({ voice });
  } catch (err) {
    logVoiceApiFailure('chat_voice_endpoint', err, {
      companyId: String(req.body?.companyId || '').trim() || undefined,
      sessionId: req.body?.sessionId || undefined,
      messageIndex: req.body?.messageIndex,
    });
    if (err.status === 402) {
      return res.status(402).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Voice synthesis failed' });
  }
}

/**
 * Build the opening text the VA avatar should speak when a session starts.
 * Mirrors the greeting logic in chat-widget.js / App.jsx so the avatar says
 * the same company-specific welcome the text chat would show.
 */
function normalizeOpeningLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return 'english';

  const isoToOpening = {
    en: 'english',
    ru: 'russian',
    uk: 'ukrainian',
    ar: 'arabic',
    hi: 'hindi',
    ja: 'japanese',
    zh: 'chinese',
    ko: 'korean',
  };

  if (Object.prototype.hasOwnProperty.call(isoToOpening, value)) return isoToOpening[value];
  if (['ru-ru', 'russian', 'русский', 'русский язык'].includes(value)) return 'russian';
  if (['uk-ua', 'ukrainian', 'українська', 'украинский'].includes(value)) return 'ukrainian';
  if (['arabic', 'العربية'].includes(value)) return 'arabic';
  if (['hindi', 'हिन्दी', 'हिंदी'].includes(value)) return 'hindi';
  if (['ja-jp', 'japanese', '日本語'].includes(value)) return 'japanese';
  if (['zh-cn', 'zh-tw', 'chinese', '中文'].includes(value)) return 'chinese';
  if (['ko-kr', 'korean', '한국어'].includes(value)) return 'korean';

  return 'english';
}

function getEffectiveOpeningLanguage(primaryLanguage, contentLocaleHint, businessProfileId = 'generic_business') {
  const primary = normalizeOpeningLanguage(primaryLanguage);
  const hint = contentLocaleHint ? normalizeOpeningLanguage(contentLocaleHint) : null;
  if (primary !== 'english') return primary;
  if (String(businessProfileId) === 'ecommerce_marketplace' && hint && hint !== 'english') return hint;
  return primary;
}

function isLegacyGenericGreeting(text, primaryLanguage, businessProfileId = 'generic_business') {
  const value = String(text || '').trim();
  if (!value) return false;

  const normalizedLanguage = normalizeOpeningLanguage(primaryLanguage);
  const englishLegacy = /(hi!\s*welcome to|your digital consultant|are you looking to build something|exploring ideas|hello!?\s*how can i help you today\??)/i.test(value);
  const genericBusinessPitch = /(цифровой консультант|решени(е|я) для своего бизнеса|наших услуг|изучаете возможности|what do you want to build|our services|business solution)/i.test(value);
  const storeTerms = /(товар|товары|категори|акци|доставк|возврат|пункт(ы)? выдачи|магазин|маркетплейс|product|products|category|categories|promotion|delivery|return|pickup|store|marketplace)/i.test(value);

  if (normalizedLanguage !== 'english' && englishLegacy) return true;
  if (String(businessProfileId) === 'ecommerce_marketplace' && genericBusinessPitch && !storeTerms) return true;
  return false;
}

function buildOpeningCopy(language, companyName, chatbotName, businessProfileId = 'generic_business') {
  const introName = String(chatbotName || '').trim();
  const safeCompanyName = String(companyName || 'our company').trim() || 'our company';

  if (businessProfileId === 'ecommerce_marketplace') {
    const marketplaceCopyByLanguage = {
      russian: {
        welcome: `Здравствуйте! Добро пожаловать в ${safeCompanyName}!`,
        intro: introName ? `Я ${introName}.` : 'Я помогу вам с сайтом магазина.',
        question: 'Подскажу по товарам, категориям, акциям, доставке, возврату и пунктам выдачи. Что вас интересует?',
      },
      english: {
        welcome: `Hi! Welcome to ${safeCompanyName}!`,
        intro: introName ? `I\'m ${introName}.` : 'I can help you with the store website.',
        question: 'I can help with products, categories, promotions, delivery, returns, and pickup points. What are you looking for?',
      },
    };

    return marketplaceCopyByLanguage[language] || marketplaceCopyByLanguage.english;
  }

  const copyByLanguage = {
    russian: {
      welcome: `Здравствуйте! Добро пожаловать в ${safeCompanyName}!`,
      intro: introName ? `Я ${introName}, ваш цифровой консультант.` : 'Я ваш цифровой консультант.',
      question: 'Чем могу помочь вам сегодня?',
    },
    ukrainian: {
      welcome: `Вітаю! Ласкаво просимо до ${safeCompanyName}!`,
      intro: introName ? `Я ${introName}, ваш цифровий консультант.` : 'Я ваш цифровий консультант.',
      question: 'Чим можу допомогти вам сьогодні?',
    },
    arabic: {
      welcome: `مرحباً! أهلاً بك في ${safeCompanyName}!`,
      intro: introName ? `أنا ${introName}، مستشارك الرقمي.` : 'أنا مستشارك الرقمي.',
      question: 'كيف يمكنني مساعدتك اليوم؟',
    },
    hindi: {
      welcome: `नमस्ते! ${safeCompanyName} में आपका स्वागत है!`,
      intro: introName ? `मैं ${introName} हूं, आपका डिजिटल कंसल्टेंट।` : 'मैं आपका डिजिटल कंसल्टेंट हूं।',
      question: 'मैं आज आपकी किस प्रकार सहायता कर सकता हूँ?',
    },
    japanese: {
      welcome: `こんにちは。${safeCompanyName}へようこそ。`,
      intro: introName ? `私は${introName}です。デジタルコンサルタントとしてご案内します。` : 'デジタルコンサルタントとしてご案内します。',
      question: '本日はどのようなご用件でしょうか。',
    },
    chinese: {
      welcome: `您好，欢迎来到${safeCompanyName}！`,
      intro: introName ? `我是${introName}，您的数字顾问。` : '我是您的数字顾问。',
      question: '今天我可以为您提供什么帮助？',
    },
    korean: {
      welcome: `안녕하세요. ${safeCompanyName}에 오신 것을 환영합니다.`,
      intro: introName ? `저는 ${introName}이며 디지털 컨설턴트입니다.` : '저는 디지털 컨설턴트입니다.',
      question: '오늘 무엇을 도와드릴까요?',
    },
    english: {
      welcome: `Hi! Welcome to ${safeCompanyName}!`,
      intro: introName ? `I'm ${introName}, your digital consultant.` : "I'm your digital consultant.",
      question: 'How can I help you today?',
    },
  };

  return copyByLanguage[language] || copyByLanguage.english;
}

function buildVaOpeningText(company) {
  const companyId = String(company?.company_id || '').trim();
  let businessProfileId = 'generic_business';
  let contentLocaleHint = '';
  if (companyId) {
    try {
      const context = loadCompanyContext(companyId) || '';
      const businessProfile = inferCompanyProfile({ context });
      businessProfileId = String(businessProfile?.id || 'generic_business');
      contentLocaleHint = String(inferTrainingContentLanguageHint(context) || '').trim();
    } catch {
      businessProfileId = 'generic_business';
      contentLocaleHint = '';
    }
  }

  const effectiveOpeningLanguage = getEffectiveOpeningLanguage(
    company?.language_primary,
    contentLocaleHint,
    businessProfileId
  );

  const explicit = String(company.greeting_message || '').trim();
  if (explicit && !isLegacyGenericGreeting(explicit, effectiveOpeningLanguage, businessProfileId)) {
    return explicit;
  }

  const copy = buildOpeningCopy(
    effectiveOpeningLanguage,
    String(company.name || '').trim() || 'our company',
    String(company.display_name || '').trim(),
    businessProfileId
  );

  const businessSummary = String(company?.business_description || company?.business_service_categories || '')
    .replace(/\s+/g, ' ')
    .trim();
  const trimmedBusinessSummary = businessSummary
    ? businessSummary.replace(/^(.{0,180}?[.!?]).*$/, '$1').trim()
    : '';
  return trimmedBusinessSummary
    ? `${copy.welcome}\n${copy.intro}\n${trimmedBusinessSummary}\n${copy.question}`
    : `${copy.welcome}\n${copy.intro}\n${copy.question}`;
}

function buildVaContextPrompt(company) {
  const companyName = String(company?.display_name || company?.name || 'our company').trim();
  const businessDescription = String(company?.business_description || '').replace(/\s+/g, ' ').trim();
  const serviceCategories = String(company?.business_service_categories || '').replace(/\s+/g, ' ').trim();
  const companyId = String(company?.company_id || '').trim();

  let contextSnippet = '';
  if (companyId) {
    try {
      contextSnippet = String(loadCompanyContext(companyId) || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^---/.test(line))
        .slice(0, 8)
        .join('\n')
        .slice(0, 900);
    } catch {
      contextSnippet = '';
    }
  }

  const promptParts = [
    `You are the live virtual assistant for ${companyName}.`,
    'Speak naturally, stay concise, and align with the company\'s real business scope and owner guidance.',
  ];

  if (businessDescription) {
    promptParts.push(`Main business: ${businessDescription}`);
  }
  if (serviceCategories) {
    promptParts.push(`Key services: ${serviceCategories}`);
  }
  if (contextSnippet) {
    promptParts.push(`Detailed AI guidance:\n${contextSnippet}`);
  }

  promptParts.push('If information is uncertain, stay accurate and invite the visitor to clarify rather than inventing details.');
  return promptParts.join('\n\n');
}

async function createLiveAvatarSessionToken(req, res) {
  try {
    const companyId = String(req.body?.companyId || '').trim();
    const embedSecret = String(req.headers['x-embed-api-key'] || '').trim();

    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    if (!embedSecret) {
      return res.status(401).json({ error: 'Missing embed API key' });
    }

    const { rows } = await pool.query(
      `SELECT em.company_id
         FROM embed_settings em
         INNER JOIN virtual_assistant_settings va ON va.company_id = em.company_id
        WHERE em.company_id = $1
          AND em.embed_secret = $2
          AND va.va_enabled = TRUE
        LIMIT 1`,
      [companyId, embedSecret]
    );
    if (!rows.length) {
      return res.status(403).json({ error: 'Invalid embed credentials for virtual assistant' });
    }

    const company = await CompanyAdmin.findByCompanyId(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    if (!company.va_enabled) {
      return res.status(409).json({ error: 'Virtual assistant is disabled' });
    }
    if (!company.liveavatar_api_key) {
      return res.status(400).json({ error: 'LiveAvatar API key is not configured' });
    }

    const apiKey = company.liveavatar_api_key;
    const sandboxMode = Boolean(company.va_sandbox_mode);
    const avatarId = sandboxMode ? LIVEAVATAR_SANDBOX_AVATAR_ID : String(company.liveavatar_avatar_id || '').trim();
    if (!avatarId) {
      return res.status(400).json({ error: 'No LiveAvatar avatar is configured' });
    }

    const avatar = await liveAvatar.getAvatar(apiKey, avatarId).catch(() => null);
    if (!avatar) {
      return res.status(400).json({ error: sandboxMode
        ? `${LIVEAVATAR_SANDBOX_AVATAR_NAME} avatar is unavailable for this LiveAvatar account`
        : 'Configured LiveAvatar avatar is unavailable' });
    }

    let contextId = String(company.liveavatar_context_id || '').trim();
    const desiredOpening = buildVaOpeningText(company);
    const desiredPrompt = buildVaContextPrompt(company);
    try {
      if (contextId) {
        const existingContext = await liveAvatar.getContext(apiKey, contextId).catch(() => null);
        if (!existingContext) {
          contextId = '';
        } else if (
          String(existingContext.opening_text || '').trim() !== desiredOpening
          || String(existingContext.prompt || '').trim() !== desiredPrompt
        ) {
          const updatedContext = await liveAvatar.updateContext(apiKey, contextId, {
            opening_text: desiredOpening,
            prompt: desiredPrompt,
          }).catch(() => null);
          const updatedOpening = String(updatedContext?.opening_text || '').trim();
          const updatedPrompt = String(updatedContext?.prompt || '').trim();
          if (updatedOpening !== desiredOpening || updatedPrompt !== desiredPrompt) {
            const verifiedContext = await liveAvatar.getContext(apiKey, contextId).catch(() => null);
            const verifiedOpening = String(verifiedContext?.opening_text || '').trim();
            const verifiedPrompt = String(verifiedContext?.prompt || '').trim();
            if (verifiedOpening !== desiredOpening || verifiedPrompt !== desiredPrompt) {
              contextId = '';
            }
          }
        }
      }

      if (!contextId) {
        const context = await liveAvatar.createContext(apiKey, {
          name: `${company.display_name || company.name || 'Chat'} Assistant`,
          prompt: desiredPrompt,
          opening_text: desiredOpening,
          links: [],
        });
        const createdContextId = String(context?.id || '').trim();
        if (createdContextId) {
          contextId = createdContextId;
          await pool.query(
            `UPDATE virtual_assistant_settings
                SET liveavatar_context_id = $1,
                    liveavatar_context_name = COALESCE($2, liveavatar_context_name),
                    updated_at = NOW()
              WHERE company_id = $3`,
            [contextId, String(context?.name || '').trim() || null, companyId]
          );
        }
      }
    } catch (contextErr) {
      // Context sync failures should not block session startup.
      console.error('[chat] liveavatar context sync failed:', {
        companyId,
        message: contextErr?.message || String(contextErr),
      });
    }

    let voiceId = '';
    if (sandboxMode) {
      voiceId = String(avatar?.default_voice?.id || avatar?.default_voice_id || avatar?.voice_id || '').trim();
    }

    if (!voiceId && String(company.va_voice_source || 'liveavatar').trim().toLowerCase() === 'elevenlabs'
      && company.elevenlabs_api_key) {
      try {
        let providerVoiceId = String(company.voice_custom_id || '').trim();
        const providerVoiceName = String(company.voice_custom_name || '').trim();

        if (!providerVoiceId) {
          const resolvedVoice = await resolveVoiceSelection({
            apiKey: company.elevenlabs_api_key,
            profile: company.voice_profile || 'professional',
            gender: company.voice_gender || 'female',
            customVoiceId: company.voice_custom_id || null,
            customVoiceName: company.voice_custom_name || null,
            customVoiceGender: company.voice_custom_gender || null,
            languageCode: normalizeLanguagePrimaryToCode(company.language_primary),
          }).catch(() => null);
          providerVoiceId = String(resolvedVoice?.voiceId || '').trim();
        }

        if (providerVoiceId) {
          const secret = await liveAvatar.createSecret(apiKey, {
            secret_name: `elevenlabs_${companyId}`,
            secret_value: company.elevenlabs_api_key,
            secret_type: 'ELEVENLABS_API_KEY',
          });
          const bound = await liveAvatar.bindThirdPartyVoice(apiKey, {
            provider_voice_id: providerVoiceId,
            secret_id: secret.id,
            name: providerVoiceName || 'ElevenLabs Voice',
          });
          voiceId = String(bound?.voice_id || '').trim();
        }
      } catch (bindErr) {
        console.error('[chat] liveavatar elevenlabs bind:', bindErr.message);
      }
    }

    if (!voiceId) {
      voiceId = String(company.liveavatar_voice_id || '').trim();
    }
    if (voiceId) {
      const existingVoice = await liveAvatar.getVoice(apiKey, voiceId).catch(() => null);
      if (!existingVoice) {
        voiceId = '';
      }
    }
    if (!voiceId) {
      voiceId = String(avatar?.default_voice?.id || avatar?.default_voice_id || avatar?.voice_id || '').trim();
    }
    if (!voiceId) {
      return res.status(400).json({ error: sandboxMode
        ? `Sandbox mode requires a supported voice for ${LIVEAVATAR_SANDBOX_AVATAR_NAME}`
        : 'No LiveAvatar voice is available for the selected avatar' });
    }

    const languageCode = normalizeLanguagePrimaryToCode(company.language_primary);
    const quality = ['low', 'medium', 'high', 'very_high'].includes(String(company.va_video_quality || '').trim().toLowerCase())
      ? String(company.va_video_quality || '').trim().toLowerCase()
      : 'high';

    const sessionPayload = {
      avatar_id: avatarId,
      voice_id: voiceId,
      // context_id intentionally omitted: session runs in restricted mode so the avatar's
      // built-in LLM does not auto-respond. All responses are driven by our AI pipeline
      // via session.repeat() (avatar.speak_text), matching the normal text-chat flow.
      language: languageCode || 'en',
      is_sandbox: sandboxMode,
      video_quality: quality,
      video_encoding: 'H264',
      interactivity_type: 'CONVERSATIONAL',
    };

    const session = await liveAvatar.createSessionToken(apiKey, sessionPayload);

    if (!session?.session_token) {
      return res.status(502).json({ error: 'Failed to create LiveAvatar session token' });
    }

    return res.json({
      sessionToken: session.session_token,
      sessionId: session.session_id || null,
      sandboxMode,
      avatarId,
      voiceId,
      contextId,
      openingText: desiredOpening,
    });
  } catch (err) {
    let errMsg = err?.message || 'Failed to create LiveAvatar session token';
    if (errMsg.toLowerCase().includes('concurrency limit')) {
      errMsg = 'All virtual assistants are currently busy. Please try again in a moment or continue with text chat.';
    }
    
    console.error('[chat] liveavatar session-token:', {
      companyId: String(req.body?.companyId || '').trim() || null,
      status: err?.status || null,
      message: err?.message || null,
      details: err?.details || null,
    });
    return res.status(err.status || 500).json({ error: errMsg });
  }
}

module.exports = { postMessage, ping, synthesizeMessageVoice, reportClientChatFailure, createLiveAvatarSessionToken };
