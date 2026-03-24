const { sendMessage: sendAnthropicMessage } = require('../services/anthropicService');
const { sendMessage: sendGeminiMessage } = require('../services/geminiService');
const { captureLeadFromConversation } = require('../services/leadCaptureService');
const { sendNewLeadNotification } = require('../services/leadNotificationService');
const {
  record: recordActiveVisitor,
  recordMessage: recordLiveMessage,
  broadcastAlert,
} = require('../services/activeVisitorsService');
const { evaluateEscalation } = require('../services/escalationService');
const { appendChatLog } = require('../services/adminLogStore');
const { add: addSupportRequest, isSupportRequest } = require('../services/supportRequestsStore');
const { normalizeVoiceGender, normalizeVoiceProfile, synthesizeTextResponse } = require('../services/elevenlabsService');
const { parseLanguageExtraLocalesJson, resolveSpeechLanguageCode } = require('../services/supportedChatLanguages');
const { detectNaturalLanguageFromText } = require('../services/chatRules');
const Chatbot = require('../models/Chatbot');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');

function buildLanguageConfig(chatbot = null) {
  return {
    primary: chatbot?.language_primary || 'en',
    multiEnabled: Boolean(chatbot?.language_multi_enabled),
    autoDetectEnabled: chatbot?.language_auto_detect_enabled !== false,
    manualSwitchEnabled: Boolean(chatbot?.language_manual_switch_enabled),
    extraLocales: parseLanguageExtraLocalesJson(chatbot?.language_extra_locales),
  };
}

function buildVoiceConfig(chatbot = null) {
  return {
    enabled: Boolean(chatbot?.voice_mode_enabled),
    elevenlabsApiKey: chatbot?.elevenlabs_api_key || null,
    responseEnabled: Boolean(chatbot?.voice_response_enabled !== false),
    gender: normalizeVoiceGender(chatbot?.voice_gender),
    profile: normalizeVoiceProfile(chatbot?.voice_profile) || 'professional',
    customVoiceId: chatbot?.voice_custom_id || null,
    customVoiceName: chatbot?.voice_custom_name || null,
    customVoiceGender: chatbot?.voice_custom_gender || null,
    ignoreEmoji: Boolean(chatbot?.voice_ignore_emoji),
  };
}

async function synthesizeCompanyVoice({ chatbot, aiLanguageConfig, voiceConfig, assistantText, userText = '' }) {
  if (!voiceConfig?.enabled || !voiceConfig?.responseEnabled) {
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
  let companyId = '_default';
  try {
    const { messages, companyId: requestCompanyId = '_default', sessionId } = req.body;
    companyId = requestCompanyId;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    let sid = sessionId || null;
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
    const userMsg = messages[messages.length - 1];
    let chatbot = null;

    // Persist pre-response data (non-fatal if DB is unavailable)
    try {
      await Chatbot.findOrCreate(companyId);
      chatbot = await Chatbot.findByCompanyId(companyId);
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

      if (!sid) {
        const { id } = await ChatSession.create(companyId);
        sid = id;
      }

      await ChatMessage.create(sid, 'user', userMsg.content);

      const session = await ChatSession.findById(sid);
      if (session?.title === 'New Chat') {
        const title = userMsg.content.replace(/\s+/g, ' ').trim().slice(0, 80);
        await ChatSession.updateTitle(sid, title);
      } else {
        await ChatSession.touch(sid);
      }

      if (chatbot?.agent_paused) {
        const pausedMessage = 'Our AI agent is currently paused. Please leave your name and contact details, and we will get back to you shortly.';
        await ChatMessage.create(sid, 'assistant', pausedMessage);

        let pausedVoice = null;
        if (voiceConfig.enabled && voiceConfig.responseEnabled) {
          try {
            pausedVoice = await synthesizeCompanyVoice({
              chatbot,
              aiLanguageConfig: aiConfig.language,
              voiceConfig,
              assistantText: pausedMessage,
              userText: userMsg?.content || '',
            });
          } catch (voiceErr) {
            console.error('[voice] paused message non-fatal:', voiceErr.message);
            appendChatLog('warn', `Voice synthesis failed: ${voiceErr.message}`, { sessionId: sid, companyId });
          }
        }

        return res.json({ content: pausedMessage, sessionId: sid, voice: pausedVoice });
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
        try {
          broadcastAlert(companyId, {
            kind: 'support_request',
            message: 'Support requested',
            link: '/admin/support-requests',
          });
        } catch (alertErr) {
          /* ignore */
        }
      }
    } catch (dbErr) {
      console.error('[chat] DB pre-write (non-fatal):', dbErr.message);
      appendChatLog('error', `Chat DB pre-write: ${dbErr.message}`, { sessionId: sid, companyId });
    }

    const response = aiConfig.provider === 'gemini'
      ? await sendGeminiMessage(companyId, messages, {
        modeId: selectedModeId,
        safetyConfig,
        model: aiConfig.model,
        apiKey: aiConfig.geminiApiKey,
        assistantName: aiConfig.assistantName,
        languageConfig: aiConfig.language,
      })
      : await sendAnthropicMessage(companyId, messages, {
        modeId: selectedModeId,
        safetyConfig,
        model: aiConfig.model,
        apiKey: aiConfig.anthropicApiKey,
        assistantName: aiConfig.assistantName,
        languageConfig: aiConfig.language,
      });
    let voice = null;

    if (voiceConfig.enabled && voiceConfig.responseEnabled) {
      try {
        voice = await synthesizeCompanyVoice({
          chatbot,
          aiLanguageConfig: aiConfig.language,
          voiceConfig,
          assistantText: response,
          userText: userMsg?.content || '',
        });
        if (!voice && process.env.ELEVENLABS_API_KEY) {
          appendChatLog('warn', 'Voice synthesis returned no audio (text may be empty after sanitization)', { sessionId: sid, companyId });
        }
      } catch (voiceErr) {
        console.error('[voice] response non-fatal:', voiceErr.message);
        appendChatLog('warn', `Voice synthesis failed: ${voiceErr.message}`, { sessionId: sid, companyId });
      }
    }

    if (sid) {
      try {
        await ChatMessage.create(sid, 'assistant', response);
        recordLiveMessage(companyId, sid, 'assistant', response, req.headers['x-page-url'] || req.headers.referer || req.body.pageUrl);
      } catch (dbErr) {
        console.error('[chat] DB post-write (non-fatal):', dbErr.message);
        appendChatLog('error', `Chat DB post-write: ${dbErr.message}`, { sessionId: sid, companyId });
      }

      let leadCaptureResult = null;
      try {
        leadCaptureResult = await captureLeadFromConversation({
          companyId,
          sessionId: sid,
          messages: [...messages, { role: 'assistant', content: response }],
          requestMeta: {
            referer: req.headers.referer,
            origin: req.headers.origin,
            pageUrl: req.headers['x-page-url'],
            userAgent: req.headers['user-agent'],
          },
        });

        if (leadCaptureResult?.captured && leadCaptureResult?.inserted && leadCaptureResult?.lead) {
          try {
            await sendNewLeadNotification({ companyId, lead: leadCaptureResult.lead });
          } catch (notifyErr) {
            console.error('[lead-notify] non-fatal:', notifyErr.message);
          }
          try {
            const lead = leadCaptureResult.lead;
            const meetingRequested = (lead?.ai_detected_intent || '') === 'meeting_booking';
            broadcastAlert(companyId, {
              kind: 'lead_captured',
              message: meetingRequested ? 'Meeting requested — new lead captured' : 'New lead captured',
              link: '/admin/leads',
            });
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
          escalation.alerts.forEach((alert) => {
            try {
              broadcastAlert(companyId, alert);
            } catch {
              /* ignore */
            }
          });
        }
      } catch (escErr) {
        // Escalation should never break chat responses
        console.error('[escalation] non-fatal:', escErr.message);
      }
    }

    res.json({ content: response, sessionId: sid, voice });
  } catch (err) {
    console.error('[chat] error:', err);
    appendChatLog('error', `Chat error: ${err.message || 'Failed to get AI response'}`, { companyId, stack: err.stack });
    res.status(500).json({ error: err.message || 'Failed to get AI response' });
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

    await Chatbot.findOrCreate(companyId);
    const chatbot = await Chatbot.findByCompanyId(companyId);
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
      if (!targetMessage || targetMessage.role !== 'assistant') {
        return res.status(404).json({ error: 'Assistant message not found' });
      }

      assistantText = String(targetMessage.content || '').trim();
      if (!resolvedUserText) {
        const priorUserMessage = rows
          .slice(0, normalizedIndex)
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
    if (!voiceConfig.enabled || !voiceConfig.responseEnabled) {
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
    console.error('[chat] synthesize voice:', err);
    if (err.status === 402) {
      return res.status(402).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Voice synthesis failed' });
  }
}

module.exports = { postMessage, ping, synthesizeMessageVoice };
