const express = require('express');
const router = express.Router();
const pillUpdateController = require('../controllers/pill_update_controller');

router.get('/', pillUpdateController.stream);

module.exports = router;