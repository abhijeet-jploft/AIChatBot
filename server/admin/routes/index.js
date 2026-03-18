const express = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');
const settingsController = require('../controllers/settingsController');
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
router.get('/companies', settingsController.listCompanies);

// ─── Protected ──────────────────────────────────────────────────────────────
router.post('/auth/logout', requireAuth, authController.logout);
router.get('/auth/me', requireAuth, authController.me);

router.get('/settings', requireAuth, settingsController.getSettings);
router.put('/settings', requireAuth, settingsController.updateSettings);
router.get('/settings/modes', requireAuth, settingsController.getModeSettings);

router.get('/theme', requireAuth, themeController.getTheme);
router.put('/theme', requireAuth, themeController.updateTheme);

router.get('/dashboard', requireAuth, dashboardController.getDashboard);
router.get('/dashboard/live', requireAuth, dashboardController.getLive);

router.get('/agent/status', requireAuth, agentController.getStatus);
router.patch('/agent/status', requireAuth, agentController.updateStatus);

router.get('/leads', requireAuth, leadsController.listLeads);
router.get('/conversations', requireAuth, conversationsController.listConversations);
router.post('/conversations/:sessionId/send', requireAuth, conversationsController.sendMessage);
router.get('/logs', requireAuth, logsController.listLogs);
router.get('/missed-conversations', requireAuth, missedConversationsController.listMissedConversations);
router.get('/support-requests', requireAuth, supportRequestsController.listSupportRequestsHandler);
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
router.get('/training/scrape/status/:jobId', requireAuth, trainingController.scrapeStatus);
router.post('/training/scrape/save/:jobId', requireAuth, trainingController.scrapeSave);

router.post('/training/conversational', requireAuth, trainingController.saveConversational);
router.post('/training/documents', requireAuth, uploadMemory.array('files', 10), trainingController.saveDocuments);
router.post('/training/structured', requireAuth, trainingController.saveStructured);
router.post('/training/structured/upload', requireAuth, uploadMemory.single('file'), trainingController.saveStructured);
router.get('/training/manual', requireAuth, trainingController.getManual);
router.put('/training/manual', requireAuth, trainingController.setManual);
router.get('/training/files', requireAuth, trainingController.listFiles);

module.exports = router;
