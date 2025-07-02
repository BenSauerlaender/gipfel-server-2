const express = require('express');
const { authenticate } = require('../middleware/auth');
const Climber = require('../models/Climber');
const Ascent = require('../models/Ascent');
const Route = require('../models/Route');
const Summit = require('../models/Summit');
const Region = require('../models/Region');
const {regionPipeline} = require('../pipelines/region')
const {cache } = require('../middleware/cache');
const { summitPipeline } = require('../pipelines/summit');
const { ascentPipeline } = require('../pipelines/ascent');
const { climberPipeline } = require('../pipelines/climber');
const { routePipeline } = require('../pipelines/route');
const router = express.Router();

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// All routes below require authentication
router.use(authenticate);

// Get all climbers
router.get('/climbers', cache('/climbers', async (req, res) => {
  try {
    return await Climber.aggregate(climberPipeline)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Get all routes
router.get('/routes', cache('/routes', async (req, res) => {
  try {
    return await Route.aggregate(routePipeline)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Get all summits
router.get('/summits', cache('/summits', async (req, res) => {
  try {
    return await Summit.aggregate(summitPipeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Get all regions
router.get('/regions', cache('/regions', async (req, res) => {
  try {
    return await Region.aggregate(regionsPipeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

// Get all ascents
router.get('/ascents', cache('/ascents', async (req, res) => {
  try {
    return await Ascent.aggregate(ascentPipeline)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}));

module.exports = router; 