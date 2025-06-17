const express = require('express');
const Example = require('../models/Example');
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all examples
router.get('/examples', async (req, res) => {
  try {
    const examples = await Example.find();
    res.json(examples);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 