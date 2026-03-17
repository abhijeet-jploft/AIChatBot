const express = require('express');
const authController = require('../controllers/authController');
const settingsController = require('../controllers/settingsController');
const leadsController = require('../controllers/leadsController');
const trainingController = require('../controllers/trainingController');
const { requireAuth } = require('../middleware/requireAuth');

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

router.get('/leads', requireAuth, leadsController.listLeads);
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

module.exports = router;
