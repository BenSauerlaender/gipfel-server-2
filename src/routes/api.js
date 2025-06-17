const express = require('express');
const Example = require('../models/Example');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router; 