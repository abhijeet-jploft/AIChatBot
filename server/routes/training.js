const express = require('express');
const trainingController = require('../controllers/trainingController');

const router = express.Router();

router.get('/companies', trainingController.getCompaniesList);
router.get('/companies/:companyId', trainingController.getCompanyBootstrap);
router.get('/companies/:companyId/context', trainingController.getCompanyContext);

module.exports = router;
