const express = require('express');
const scraperController = require('../controllers/scraperController');

const router = express.Router();

router.post('/start', scraperController.start);
router.get('/status/:jobId', scraperController.status);
router.get('/download/:jobId', scraperController.download);
router.post('/save/:jobId', scraperController.save);

module.exports = router;
