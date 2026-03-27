const {
  getNotificationPreferences,
  updateNotificationPreferences,
} = require('../../services/notificationPreferencesService');

async function getPrefs(req, res) {
  try {
    const prefs = await getNotificationPreferences(req.adminCompanyId);
    res.json({
      channels: {
        email: prefs.channelEmail,
        dashboard: prefs.channelDashboard,
      },
      types: {
        newLead: prefs.types.newLead,
        meetingRequest: prefs.types.meetingRequest,
        trainingCompletion: prefs.types.trainingCompletion,
        payment: prefs.types.payment,
        systemAlert: prefs.types.systemAlert,
      },
    });
  } catch (err) {
    console.error('[notification prefs] get:', err);
    res.status(500).json({ error: err.message });
  }
}

async function putPrefs(req, res) {
  try {
    const { channels, types } = req.body || {};
    const patch = {
      channelEmail: channels?.email,
      channelDashboard: channels?.dashboard,
      types: types && typeof types === 'object'
        ? {
          newLead: types.newLead,
          meetingRequest: types.meetingRequest,
          trainingCompletion: types.trainingCompletion,
          payment: types.payment,
          systemAlert: types.systemAlert,
        }
        : undefined,
    };
    const next = await updateNotificationPreferences(req.adminCompanyId, patch);
    res.json({
      channels: {
        email: next.channelEmail,
        dashboard: next.channelDashboard,
      },
      types: {
        newLead: next.types.newLead,
        meetingRequest: next.types.meetingRequest,
        trainingCompletion: next.types.trainingCompletion,
        payment: next.types.payment,
        systemAlert: next.types.systemAlert,
      },
    });
  } catch (err) {
    console.error('[notification prefs] put:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPrefs, putPrefs };
