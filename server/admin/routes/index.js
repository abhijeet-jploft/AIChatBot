const express = require('express');
const authController = require('../controllers/authController');
const settingsController = require('../controllers/settingsController');
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

router.post('/training/scrape/start', requireAuth, trainingController.startScrape);
router.get('/training/scrape/status/:jobId', requireAuth, trainingController.scrapeStatus);
router.post('/training/scrape/save/:jobId', requireAuth, trainingController.scrapeSave);

module.exports = router;
