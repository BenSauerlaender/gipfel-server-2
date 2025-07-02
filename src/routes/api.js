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
const CacheService = require('../services/cacheService')
const computeTrips = require('../utill/computeTrips')
const router = express.Router();

// Health check endpoint (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// All routes below require authentication
router.use(authenticate);

// Get all climbers
router.get('/climbers', cache('/climbers', async (req, res) => {
    return await Climber.aggregate(climberPipeline)
}));

// Get all routes
router.get('/routes', cache('/routes', async (req, res) => {
    return await Route.aggregate(routePipeline)
}));

// Get all summits
router.get('/summits', cache('/summits', async (req, res) => {
    return await Summit.aggregate(summitPipeline);
}));

// Get all regions
router.get('/regions', cache('/regions', async (req, res) => {
    return await Region.aggregate(regionPipeline);
}));

// Get all ascents
router.get('/ascents', cache('/ascents', async (req, res) => {
    return await Ascent.aggregate(ascentPipeline)
}));

// Get trip object
router.get('/trips', cache('/trips', async (req, res) => {
      const cacheKey = CacheService.generateCacheKey('/ascents');
      
      // Check cache
      let ascents = CacheService.get(cacheKey);
      if (!ascents) {
        ascents = await Ascent.aggregate(ascentPipeline)
      }
      return computeTrips(ascents)

}));

module.exports = router; 