const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/message', (req, res) => chatController.postMessage(req, res));

module.exports = router;
