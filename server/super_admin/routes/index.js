const express = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const companiesController = require('../controllers/companiesController');
const companySettingsController = require('../controllers/companySettingsController');
const trainingController = require('../controllers/trainingController');
const systemController = require('../controllers/systemController');
const supportTicketsController = require('../controllers/supportTicketsController');
const apiTrackingController = require('../controllers/apiTrackingController');
const staffController = require('../controllers/staffController');
const {
	requireSuperAuth,
	requirePermission,
	requireAnyPermission,
	requireCompanySettingsMutation,
} = require('../middleware/requireSuperAuth');

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
router.get('/dashboard', requireSuperAuth, requirePermission('dashboard', 'view'), dashboardController.getDashboard);

// Companies
router.get('/companies', requireSuperAuth, requireAnyPermission([
	['business_management', 'view'],
	['ai_configuration', 'view'],
	['voice_management', 'view'],
	['api_management', 'view'],
	['user_management', 'view'],
]), companiesController.listCompanies);
router.post('/companies', requireSuperAuth, requirePermission('business_management', 'edit'), companiesController.createCompany);
router.get('/companies/:companyId', requireSuperAuth, requireAnyPermission([
	['business_management', 'view'],
	['ai_configuration', 'view'],
	['voice_management', 'view'],
	['api_management', 'view'],
	['user_management', 'view'],
]), companiesController.getCompany);
router.patch('/companies/:companyId', requireSuperAuth, requirePermission('business_management', 'edit'), companiesController.updateCompany);
router.patch('/companies/:companyId/suspension', requireSuperAuth, requirePermission('business_management', 'edit'), companiesController.setCompanySuspension);
router.delete('/companies/:companyId', requireSuperAuth, requirePermission('business_management', 'full'), companiesController.deleteCompany);
router.post('/companies/:companyId/reset-password', requireSuperAuth, requirePermission('user_management', 'edit'), companiesController.resetAdminPassword);
router.post('/companies/:companyId/regenerate-embed-secret', requireSuperAuth, requirePermission('api_management', 'edit'), companiesController.regenerateEmbedSecret);
router.post('/companies/:companyId/impersonate', requireSuperAuth, requirePermission('user_management', 'full'), companiesController.impersonateCompanyAdmin);
router.get('/companies/:companyId/stats', requireSuperAuth, requireAnyPermission([
	['business_management', 'view'],
	['ai_configuration', 'view'],
	['voice_management', 'view'],
	['api_management', 'view'],
	['user_management', 'view'],
]), companiesController.getCompanyStats);
router.get('/companies/:companyId/api-tracking', requireSuperAuth, requirePermission('api_management', 'view'), apiTrackingController.getCompanyApiTracking);
router.get('/companies/:companyId/settings', requireSuperAuth, requireAnyPermission([
	['business_management', 'view'],
	['ai_configuration', 'view'],
	['voice_management', 'view'],
	['api_management', 'view'],
	['system_settings', 'view'],
]), companySettingsController.getCompanySettings);
router.get('/companies/:companyId/settings/admin-visibility', requireSuperAuth, requirePermission('user_management', 'view'), companySettingsController.getCompanyAdminVisibility);
router.patch('/companies/:companyId/settings/admin-visibility', requireSuperAuth, requirePermission('user_management', 'edit'), companySettingsController.patchCompanyAdminVisibility);
router.get('/companies/:companyId/settings/modes', requireSuperAuth, requirePermission('ai_configuration', 'view'), companySettingsController.getCompanyModeSettings);
router.get('/companies/:companyId/settings/voices', requireSuperAuth, requirePermission('voice_management', 'view'), companySettingsController.getCompanyVoices);
router.post('/companies/:companyId/settings/voice-preview', requireSuperAuth, requirePermission('voice_management', 'view'), companySettingsController.previewCompanyVoice);
router.patch('/companies/:companyId/settings', requireSuperAuth, requireCompanySettingsMutation, companySettingsController.patchCompanySettings);

// Training (per company)
router.post('/training/:companyId/scrape/start', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_scrape', 'edit'],
]), trainingController.startScrape);
router.get('/training/:companyId/scrape/status/:jobId', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'view'],
	['training_scrape', 'view'],
]), trainingController.scrapeStatus);
router.post('/training/:companyId/scrape/save/:jobId', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_scrape', 'edit'],
]), trainingController.scrapeSave);
router.post('/training/:companyId/conversational', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_conversational', 'edit'],
]), trainingController.saveConversational);
router.post('/training/:companyId/documents', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_documents', 'edit'],
]), uploadMemory.array('files', 10), trainingController.saveDocuments);
router.post('/training/:companyId/database', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_database', 'edit'],
]), uploadMemory.array('files', 10), trainingController.saveDatabase);
router.post('/training/:companyId/media/transcribe', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_media', 'edit'],
]), uploadMemory.array('files', 10), trainingController.transcribeMedia);
router.post('/training/:companyId/media', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_media', 'edit'],
]), uploadMemory.array('files', 10), trainingController.saveMedia);
router.post('/training/:companyId/structured', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_structured', 'edit'],
]), trainingController.saveStructured);
router.post('/training/:companyId/structured/upload', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_structured', 'edit'],
]), uploadMemory.single('file'), trainingController.saveStructured);
router.get('/training/:companyId/manual', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'view'],
	['training_manual', 'view'],
]), trainingController.getManual);
router.put('/training/:companyId/manual', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'edit'],
	['training_manual', 'edit'],
]), trainingController.setManual);
router.get('/training/:companyId/files', requireSuperAuth, requireAnyPermission([
	['ai_configuration', 'view'],
	['training_scrape', 'view'],
	['training_conversational', 'view'],
	['training_documents', 'view'],
	['training_database', 'view'],
	['training_media', 'view'],
	['training_structured', 'view'],
	['training_manual', 'view'],
]), trainingController.listFiles);

// System
router.get('/system/status', requireSuperAuth, requirePermission('system_settings', 'view'), systemController.getSystemStatus);
router.get('/system/logs', requireSuperAuth, requirePermission('system_settings', 'view'), systemController.getSystemLogs);
router.get('/support-tickets', requireSuperAuth, requirePermission('support_tickets', 'view'), supportTicketsController.listSupportTickets);
router.patch('/support-tickets/:ticketId/status', requireSuperAuth, requirePermission('support_tickets', 'edit'), supportTicketsController.updateSupportTicketStatus);
router.get('/support-tickets/:ticketId/messages', requireSuperAuth, requirePermission('support_tickets', 'view'), supportTicketsController.listSupportTicketMessages);
router.post('/support-tickets/:ticketId/messages', requireSuperAuth, requirePermission('support_tickets', 'edit'), supportTicketsController.createSupportTicketMessage);
router.get('/reports', requireSuperAuth, requirePermission('analytics', 'view'), systemController.getReports);
router.get('/alert-rules', requireSuperAuth, requirePermission('system_settings', 'view'), systemController.listAlertRules);
router.post('/alert-rules', requireSuperAuth, requirePermission('system_settings', 'edit'), systemController.createAlertRule);
router.patch('/alert-rules/:ruleId', requireSuperAuth, requirePermission('system_settings', 'edit'), systemController.updateAlertRule);
router.delete('/alert-rules/:ruleId', requireSuperAuth, requirePermission('system_settings', 'full'), systemController.deleteAlertRule);

// Staff management
router.get('/staff/overview', requireSuperAuth, requirePermission('user_management', 'view'), staffController.getOverview);
router.get('/staff/permission-catalog', requireSuperAuth, requirePermission('user_management', 'view'), staffController.getPermissionCatalog);
router.get('/staff/roles', requireSuperAuth, requirePermission('user_management', 'view'), staffController.listRoles);
router.post('/staff/roles', requireSuperAuth, requirePermission('user_management', 'edit'), staffController.createRole);
router.patch('/staff/roles/:roleId', requireSuperAuth, requirePermission('user_management', 'edit'), staffController.updateRole);
router.delete('/staff/roles/:roleId', requireSuperAuth, requirePermission('user_management', 'full'), staffController.deleteRole);
router.get('/staff/users', requireSuperAuth, requirePermission('user_management', 'view'), staffController.listStaffUsers);
router.post('/staff/users', requireSuperAuth, requirePermission('user_management', 'edit'), staffController.createStaffUser);
router.patch('/staff/users/:staffId', requireSuperAuth, requirePermission('user_management', 'edit'), staffController.updateStaffUser);
router.post('/staff/users/:staffId/reset-password', requireSuperAuth, requirePermission('user_management', 'edit'), staffController.resetStaffPassword);
router.delete('/staff/users/:staffId', requireSuperAuth, requirePermission('user_management', 'full'), staffController.deleteStaffUser);
router.get('/staff/audit-logs', requireSuperAuth, requirePermission('user_management', 'view'), staffController.getAuditLogs);

module.exports = router;
