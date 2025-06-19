const express = require('express');
const { authenticate } = require('../middleware/auth');
const Climber = require('../models/Climber');
const Ascent = require('../models/Ascent');
const router = express.Router();

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// All routes below require authentication
router.use(authenticate);

// Get all climbers
router.get('/climbers', async (req, res) => {
  try {
    const climbers = await Climber.find();
    res.json(climbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all ascents for a given climber (by climberId)
router.get('/climbers/:climberId/ascents', async (req, res) => {
  try {
    const { climberId } = req.params;
    const ascents = await Ascent.find({ climbers: climberId })
      .populate('route')
      .populate('climbers')
      .populate('leadClimber');
    res.json(ascents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all ascents
router.get('/ascents', async (req, res) => {
  try {
    const ascents = await Ascent.find()
      .populate('route')
      .populate('climbers')
      .populate('leadClimber');
    res.json(ascents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 