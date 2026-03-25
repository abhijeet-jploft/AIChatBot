const express = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const companiesController = require('../controllers/companiesController');
const companySettingsController = require('../controllers/companySettingsController');
const trainingController = require('../controllers/trainingController');
const systemController = require('../controllers/systemController');
const { requireSuperAuth } = require('../middleware/requireSuperAuth');

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const router = express.Router();

// ─── Public ──────────────────────────────────────────────────────────────────
router.get('/auth/status', authController.status);
router.post('/auth/setup', authController.setup);
router.post('/auth/login', authController.login);

// ─── Protected ───────────────────────────────────────────────────────────────
router.post('/auth/logout', requireSuperAuth, authController.logout);
router.get('/auth/me', requireSuperAuth, authController.me);
router.patch('/auth/profile', requireSuperAuth, authController.updateProfile);
router.post('/auth/profile/avatar', requireSuperAuth, uploadAvatar.single('avatar'), authController.uploadProfileAvatar);
router.post('/auth/change-password', requireSuperAuth, authController.changePassword);

// Dashboard
router.get('/dashboard', requireSuperAuth, dashboardController.getDashboard);

// Companies
router.get('/companies', requireSuperAuth, companiesController.listCompanies);
router.post('/companies', requireSuperAuth, companiesController.createCompany);
router.get('/companies/:companyId', requireSuperAuth, companiesController.getCompany);
router.patch('/companies/:companyId', requireSuperAuth, companiesController.updateCompany);
router.patch('/companies/:companyId/suspension', requireSuperAuth, companiesController.setCompanySuspension);
router.delete('/companies/:companyId', requireSuperAuth, companiesController.deleteCompany);
router.post('/companies/:companyId/reset-password', requireSuperAuth, companiesController.resetAdminPassword);
router.post('/companies/:companyId/regenerate-embed-secret', requireSuperAuth, companiesController.regenerateEmbedSecret);
router.post('/companies/:companyId/impersonate', requireSuperAuth, companiesController.impersonateCompanyAdmin);
router.get('/companies/:companyId/stats', requireSuperAuth, companiesController.getCompanyStats);
router.get('/companies/:companyId/settings', requireSuperAuth, companySettingsController.getCompanySettings);
router.get('/companies/:companyId/settings/admin-visibility', requireSuperAuth, companySettingsController.getCompanyAdminVisibility);
router.patch('/companies/:companyId/settings/admin-visibility', requireSuperAuth, companySettingsController.patchCompanyAdminVisibility);
router.get('/companies/:companyId/settings/modes', requireSuperAuth, companySettingsController.getCompanyModeSettings);
router.get('/companies/:companyId/settings/voices', requireSuperAuth, companySettingsController.getCompanyVoices);
router.post('/companies/:companyId/settings/voice-preview', requireSuperAuth, companySettingsController.previewCompanyVoice);
router.patch('/companies/:companyId/settings', requireSuperAuth, companySettingsController.patchCompanySettings);

// Training (per company)
router.post('/training/:companyId/scrape/start', requireSuperAuth, trainingController.startScrape);
router.get('/training/:companyId/scrape/status/:jobId', requireSuperAuth, trainingController.scrapeStatus);
router.post('/training/:companyId/scrape/save/:jobId', requireSuperAuth, trainingController.scrapeSave);
router.post('/training/:companyId/conversational', requireSuperAuth, trainingController.saveConversational);
router.post('/training/:companyId/documents', requireSuperAuth, uploadMemory.array('files', 10), trainingController.saveDocuments);
router.post('/training/:companyId/database', requireSuperAuth, uploadMemory.array('files', 10), trainingController.saveDatabase);
router.post('/training/:companyId/media/transcribe', requireSuperAuth, uploadMemory.array('files', 10), trainingController.transcribeMedia);
router.post('/training/:companyId/media', requireSuperAuth, uploadMemory.array('files', 10), trainingController.saveMedia);
router.post('/training/:companyId/structured', requireSuperAuth, trainingController.saveStructured);
router.post('/training/:companyId/structured/upload', requireSuperAuth, uploadMemory.single('file'), trainingController.saveStructured);
router.get('/training/:companyId/manual', requireSuperAuth, trainingController.getManual);
router.put('/training/:companyId/manual', requireSuperAuth, trainingController.setManual);
router.get('/training/:companyId/files', requireSuperAuth, trainingController.listFiles);

// System
router.get('/system/status', requireSuperAuth, systemController.getSystemStatus);
router.get('/reports', requireSuperAuth, systemController.getReports);
router.get('/alert-rules', requireSuperAuth, systemController.listAlertRules);
router.post('/alert-rules', requireSuperAuth, systemController.createAlertRule);
router.patch('/alert-rules/:ruleId', requireSuperAuth, systemController.updateAlertRule);
router.delete('/alert-rules/:ruleId', requireSuperAuth, systemController.deleteAlertRule);

module.exports = router;
