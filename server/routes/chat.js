const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/message', (req, res) => chatController.postMessage(req, res));
router.post('/client-error', (req, res) => chatController.reportClientChatFailure(req, res));
router.post('/voice', (req, res) => chatController.synthesizeMessageVoice(req, res));
router.post('/liveavatar/session-token', (req, res) => chatController.createLiveAvatarSessionToken(req, res));
router.post('/ping', (req, res) => chatController.ping(req, res));

module.exports = router;
