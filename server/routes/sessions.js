const express = require('express');
const sessionsController = require('../controllers/sessionsController');

const router = express.Router();

router.get('/', sessionsController.list);
router.get('/:id/messages', sessionsController.getMessages);
router.delete('/:id', sessionsController.remove);

module.exports = router;
