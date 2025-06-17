const express = require('express');
const Example = require('../models/Example');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all examples (protected)
router.get('/examples', authenticate, async (req, res) => {
  try {
    const examples = await Example.find();
    res.json(examples);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 