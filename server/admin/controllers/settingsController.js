const CompanyAdmin = require('../models/CompanyAdmin');
const pool = require('../../db/index');
const { mergeCompanyTheme } = require('../../services/companyTheme');
const {
  getModeCatalog,
  isValidConversationModeId,
  normalizeConversationModeId,
} = require('../../services/conversationModes');
const {
  createCustomVoiceFromSamples,
  getVoiceList,
  getVoicePreviewText,
  getVoicePresetCatalog,
  normalizeVoiceGender,
  normalizeVoiceProfile,
  synthesizeTextResponse,
} = require('../../services/elevenlabsService');

function normalizeNotificationEmail(value) {
  if (value === undefined) return undefined;
  const email = String(value || '').trim().toLowerCase();
  return email || null;
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

function getCompanyCustomVoice(company) {
  const voiceId = String(company?.voice_custom_id || '').trim();
  if (!voiceId) return null;

  return {
    voiceId,
    voiceName: String(company?.voice_custom_name || 'My Voice').trim() || 'My Voice',
    gender: company?.voice_custom_gender === 'male' ? 'male' : 'female',
  };
}

function buildVoicePayload(company) {
  const customVoice = getCompanyCustomVoice(company);
  const storedProfile = normalizeVoiceProfile(company?.voice_profile) || 'professional';
  const effectiveProfile = storedProfile === 'custom' && !customVoice ? 'professional' : storedProfile;
  const effectiveGender = effectiveProfile === 'custom'
    ? (customVoice?.gender || 'female')
    : normalizeVoiceGender(company?.voice_gender);

  return {
    enabled: Boolean(company?.voice_mode_enabled),
    responseEnabled: Boolean(company?.voice_response_enabled !== false),
    gender: effectiveGender,
    profile: effectiveProfile,
    ignoreEmoji: Boolean(company?.voice_ignore_emoji),
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
    catalog: getVoicePresetCatalog({ customVoice }),
  };
}

async function getSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const modeCatalog = getModeCatalog(company.ai_mode);
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
      aiMode: modeCatalog.active,
      leadNotifications: {
        emailEnabled: Boolean(company.lead_email_notifications_enabled),
        email: company.lead_notification_email || null,
      },
      voice: buildVoicePayload(company),
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
        primary: company.language_primary || 'English',
        multiEnabled: Boolean(company.language_multi_enabled),
        autoDetectEnabled: Boolean(company.language_auto_detect_enabled),
        manualSwitchEnabled: Boolean(company.language_manual_switch_enabled),
      },
      theme: mergeCompanyTheme(company.company_id, {
        primaryColor: company.theme_primary_color,
        primaryDarkColor: company.theme_primary_dark_color,
        secondaryColor: company.theme_secondary_color,
        secondaryLightColor: company.theme_secondary_light_color,
        headerBackground: company.theme_header_background,
        headerShadow: company.theme_header_shadow,
        headerTextColor: company.theme_header_text_color,
      }),
    });
  } catch (err) {
    console.error('[admin settings] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const { displayName, iconUrl, greetingMessage, aiMode, theme, leadNotifications, voice, escalation, safety, language } = req.body;

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

    const companyBeforeUpdate = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!companyBeforeUpdate) {
      return res.status(404).json({ error: 'Company not found' });
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

    await CompanyAdmin.updateSettings(req.adminCompanyId, {
      display_name: displayName !== undefined ? displayName : undefined,
      icon_url: iconUrl !== undefined ? iconUrl : undefined,
      greeting_message: greetingMessage !== undefined ? greetingMessage : undefined,
      ai_mode: aiMode !== undefined ? normalizeConversationModeId(aiMode) : undefined,
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
      language_primary: language?.primary !== undefined ? String(language.primary || 'English') : undefined,
      language_multi_enabled: language?.multiEnabled !== undefined ? Boolean(language.multiEnabled) : undefined,
      language_auto_detect_enabled: language?.autoDetectEnabled !== undefined ? Boolean(language.autoDetectEnabled) : undefined,
      language_manual_switch_enabled: language?.manualSwitchEnabled !== undefined ? Boolean(language.manualSwitchEnabled) : undefined,
    });

    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    const modeCatalog = getModeCatalog(company.ai_mode);
    res.json({
      companyId: company.company_id,
      name: company.name,
      displayName: company.display_name || company.name,
      iconUrl: company.icon_url || null,
      greetingMessage: company.greeting_message || null,
      aiMode: modeCatalog.active,
      leadNotifications: {
        emailEnabled: Boolean(company.lead_email_notifications_enabled),
        email: company.lead_notification_email || null,
      },
      voice: buildVoicePayload(company),
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
        primary: company.language_primary || 'English',
        multiEnabled: Boolean(company.language_multi_enabled),
        autoDetectEnabled: Boolean(company.language_auto_detect_enabled),
        manualSwitchEnabled: Boolean(company.language_manual_switch_enabled),
      },
      theme: mergeCompanyTheme(company.company_id, {
        primaryColor: company.theme_primary_color,
        primaryDarkColor: company.theme_primary_dark_color,
        secondaryColor: company.theme_secondary_color,
        secondaryLightColor: company.theme_secondary_light_color,
        headerBackground: company.theme_header_background,
        headerShadow: company.theme_header_shadow,
        headerTextColor: company.theme_header_text_color,
      }),
    });
  } catch (err) {
    console.error('[admin settings] update:', err);
    res.status(500).json({ error: err.message });
  }
}

async function listCompanies(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT company_id, name, display_name FROM chatbots
       WHERE company_id != '_default'
       ORDER BY name ASC`
    );
    res.json(rows.map((r) => ({
      companyId: r.company_id,
      name: r.name,
      displayName: r.display_name || r.name,
    })));
  } catch (err) {
    console.error('[admin] list companies:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getModeSettings(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(getModeCatalog(company.ai_mode));
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

    const bodyText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const previewText = bodyText
      ? bodyText.slice(0, 260)
      : getVoicePreviewText(profile, gender, {
        customVoiceId: customVoice?.voiceId,
        customVoiceName: customVoice?.voiceName,
        customVoiceGender: customVoice?.gender,
      });

    const voice = await synthesizeTextResponse(previewText, {
      gender,
      profile,
      customVoiceId: customVoice?.voiceId,
      customVoiceName: customVoice?.voiceName,
      customVoiceGender: customVoice?.gender,
      ignoreEmoji: true,
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
    console.error('[admin settings] preview voice:', err);
    if (err.status === 402) {
      return res.status(402).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
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
    const voices = getVoiceList({ gender, profile, search }, { customVoice });
    res.json({ voices });
  } catch (err) {
    console.error('[admin settings] list voices:', err);
    res.status(500).json({ error: err.message });
  }
}

async function trainCustomVoice(req, res) {
  try {
    const company = await CompanyAdmin.findByCompanyId(req.adminCompanyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

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
      voice: buildVoicePayload(updatedCompany),
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
  updateSettings,
  previewVoice,
  listVoices,
  trainCustomVoice,
  listCompanies,
  getModeSettings,
  listActiveSessions,
  logoutAllSessions,
};
