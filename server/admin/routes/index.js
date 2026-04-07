const express = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');
const settingsController = require('../controllers/settingsController');
const notificationPreferencesController = require('../controllers/notificationPreferencesController');
const emailSmtpController = require('../controllers/emailSmtpController');
const themeController = require('../controllers/themeController');
const dashboardController = require('../controllers/dashboardController');
const agentController = require('../controllers/agentController');
const leadsController = require('../controllers/leadsController');
const conversationsController = require('../controllers/conversationsController');
const logsController = require('../controllers/logsController');
const missedConversationsController = require('../controllers/missedConversationsController');
const supportRequestsController = require('../controllers/supportRequestsController');
const trainingController = require('../controllers/trainingController');
const { requireAuth } = require('../middleware/requireAuth');

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = express.Router();

// ─── Public ─────────────────────────────────────────────────────────────────
router.post('/auth/login', authController.login);
router.post('/auth/setup', authController.setup);

// ─── Protected ──────────────────────────────────────────────────────────────
router.post('/auth/logout', requireAuth, authController.logout);
router.get('/auth/me', requireAuth, authController.me);
router.patch('/auth/profile', requireAuth, authController.updateProfile);
router.post('/auth/change-password', requireAuth, authController.changePassword);

router.get('/settings', requireAuth, settingsController.getSettings);
router.put('/settings', requireAuth, settingsController.updateSettings);
router.post('/settings/icon-upload', requireAuth, uploadMemory.single('icon'), settingsController.uploadCompanyIcon);
router.post('/settings/voice-preview', requireAuth, settingsController.previewVoice);
router.post('/settings/voice-train', requireAuth, uploadMemory.array('samples', 8), settingsController.trainCustomVoice);
router.get('/settings/voices/debug', requireAuth, settingsController.debugVoices);
router.get('/settings/voices', requireAuth, settingsController.listVoices);
router.get('/settings/sessions', requireAuth, settingsController.listActiveSessions);
router.delete('/settings/sessions', requireAuth, settingsController.logoutAllSessions);
router.get('/settings/modes', requireAuth, settingsController.getModeSettings);

router.get('/theme', requireAuth, themeController.getTheme);
router.put('/theme', requireAuth, themeController.updateTheme);

router.get('/notification-preferences', requireAuth, notificationPreferencesController.getPrefs);
router.put('/notification-preferences', requireAuth, notificationPreferencesController.putPrefs);

router.get('/email-smtp', requireAuth, emailSmtpController.getSmtp);
router.put('/email-smtp', requireAuth, emailSmtpController.putSmtp);
router.post('/email-smtp/test', requireAuth, emailSmtpController.testSmtp);

router.get('/dashboard', requireAuth, dashboardController.getDashboard);
router.get('/dashboard/live', requireAuth, dashboardController.getLive);

router.get('/agent/status', requireAuth, agentController.getStatus);
router.patch('/agent/status', requireAuth, agentController.updateStatus);

router.get('/leads', requireAuth, leadsController.listLeads);
router.get('/conversations', requireAuth, conversationsController.listConversations);
router.get('/conversations/:sessionId', requireAuth, conversationsController.getConversationDetail);
router.get('/conversations/:sessionId/messages', requireAuth, conversationsController.getMessages);
router.post('/conversations/:sessionId/send', requireAuth, conversationsController.sendMessage);
router.post('/conversations/:sessionId/operate', requireAuth, conversationsController.operateSession);
router.post('/conversations/:sessionId/release', requireAuth, conversationsController.releaseSession);
router.post('/conversations/:sessionId/convert-lead', requireAuth, conversationsController.convertConversationToLead);
router.get('/logs', requireAuth, logsController.listLogs);
router.get('/missed-conversations', requireAuth, missedConversationsController.listMissedConversations);
router.get('/support-requests', requireAuth, supportRequestsController.listSupportRequestsHandler);
router.post('/support-requests', requireAuth, supportRequestsController.createSupportRequestHandler);
router.get('/support-requests/:ticketId/messages', requireAuth, supportRequestsController.listSupportRequestMessagesHandler);
router.post('/support-requests/:ticketId/messages', requireAuth, supportRequestsController.createSupportRequestMessageHandler);
router.get('/leads/summary', requireAuth, leadsController.getSummary);
router.get('/leads/export.csv', requireAuth, leadsController.exportCsv);
router.get('/leads/:leadId', requireAuth, leadsController.getLeadDetail);
router.get('/leads/:leadId/transcript.txt', requireAuth, leadsController.downloadTranscript);
router.patch('/leads/:leadId/status', requireAuth, leadsController.updateLeadStatus);
router.patch('/leads/:leadId/owner', requireAuth, leadsController.updateLeadOwner);
router.patch('/leads/:leadId/reminder', requireAuth, leadsController.updateLeadReminder);
router.post('/leads/:leadId/notes', requireAuth, leadsController.addNote);
router.post('/leads/:leadId/activity', requireAuth, leadsController.addActivity);
router.delete('/leads/:leadId', requireAuth, leadsController.removeLead);

router.post('/training/scrape/start', requireAuth, trainingController.startScrape);
router.get('/training/scrape/active', requireAuth, trainingController.scrapeActive);
router.get('/training/scrape/status/:jobId', requireAuth, trainingController.scrapeStatus);
router.post('/training/scrape/pause/:jobId', requireAuth, trainingController.scrapePause);
router.post('/training/scrape/stop/:jobId', requireAuth, trainingController.scrapeStop);
router.post('/training/scrape/resume/:jobId', requireAuth, trainingController.scrapeResume);
router.post('/training/scrape/save/:jobId', requireAuth, trainingController.scrapeSave);

router.post('/training/conversational', requireAuth, trainingController.saveConversational);
router.post('/training/documents', requireAuth, uploadMemory.array('files', 10), trainingController.saveDocuments);
router.post('/training/database', requireAuth, uploadMemory.array('files', 10), trainingController.saveDatabase);
router.post('/training/media/transcribe', requireAuth, uploadMemory.array('files', 10), trainingController.transcribeMedia);
router.post('/training/media', requireAuth, uploadMemory.array('files', 10), trainingController.saveMedia);
router.post('/training/structured', requireAuth, trainingController.saveStructured);
router.post('/training/structured/upload', requireAuth, uploadMemory.single('file'), trainingController.saveStructured);
router.get('/training/manual', requireAuth, trainingController.getManual);
router.put('/training/manual', requireAuth, trainingController.setManual);
router.get('/training/files', requireAuth, trainingController.listFiles);

module.exports = router;
