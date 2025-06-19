const express = require('express');
const { authenticate } = require('../middleware/auth');
const Climber = require('../models/Climber');
const Ascent = require('../models/Ascent');
const Route = require('../models/Route');
const Summit = require('../models/Summit');
const Region = require('../models/Region');
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

// Get all routes
router.get('/routes', async (req, res) => {
  try {
    const routes = await Route.find();
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all summits
router.get('/summits', async (req, res) => {
  try {
    const summits = await Summit.find().populate('region');
    res.json(summits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all ascents
router.get('/ascents', async (req, res) => {
  try {
    const ascents = await Ascent.find()
    res.json(ascents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 