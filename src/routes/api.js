const express = require('express');
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
const { routePipeline, routesBySummitPipeline } = require('../pipelines/route');
const CacheService = require('../services/cacheService')
const computeTrips = require('../utill/computeTrips')
const router = express.Router();
const LastChange = require('../models/LastChange');
const fs = require('fs');
const resourcePaths = require('../utill/resourcePaths');


// Get all climbers
router.get('/climbers', cache('/climbers', async (req, res) => {
    const data = await Climber.aggregate(climberPipeline)
    return {data: data, date: new Date()};
}));

// Get all routes
router.get('/routes', cache('/routes', async (req, res) => {
    const data = await Route.aggregate(routesBySummitPipeline)
    return {data: data, date: new Date()};
}));

// Get all summits
router.get('/summits', cache('/summits', async (req, res) => {
    const data = await Summit.aggregate(summitPipeline);
    return {data: data, date: new Date()};
}));

// Get all regions
router.get('/regions', cache('/regions', async (req, res) => {
    const data = await Region.aggregate(regionPipeline);
    return {data: data, date: new Date()};
}));

// Get all ascents
router.get('/ascents', cache('/ascents', async (req, res) => {
    const data = await Ascent.aggregate(ascentPipeline)
    return {data: data, date: new Date()};
}));

// Get trip object
router.get('/trips', cache('/trips', async (req, res) => {
      const cacheKey = CacheService.generateCacheKey('/ascents');
      
      // Check cache
      let ascents = CacheService.get(cacheKey);
      if (!ascents) {
        ascents = await Ascent.aggregate(ascentPipeline)
      }
      return {data: computeTrips(ascents), date: new Date()}; 

}));

const routeDependencies = {
    ascents: ["climbers", "routes", "summits","regions"], 
    climbers: ["ascents"], 
    regions: ["summits"], 
    routes: ["regions","summits"], 
    summits: ["regions", "routes"], 
    trips: ["ascents","climbers", "routes", "summits","regions"]
};

router.get('/last-modified/map', async (req, res) => {
  try {
    const files = [
      resourcePaths.mapFontsPath,
      resourcePaths.mapSpritePngPath,
      resourcePaths.mapSpriteJsonPath,
      resourcePaths.mapStylePath,
      resourcePaths.mapTilesPath
    ];
    const lastModified = files.map(file => {
      var stats = fs.statSync(file);
      return new Date(stats.mtime);
    }).sort((a, b) => b - a)[0]; // Get the most recent modification date
    res.json(lastModified);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving last modification date.' });
    console.error('Error retrieving last modification date:', err);
  }
});


router.get('/last-modified/:route', async (req, res) => {
  const { route } = req.params;

  const dependencies = routeDependencies[route];
  if (!dependencies) {
    return res.status(400).json({ error: 'Invalid route name.' });
  }
  dependencies.push(route); // include the route itself

  try {
    const lastModifiedDays = []
    for (const collection of dependencies) {
      const record = await LastChange.findOne({ collectionName: collection });
      if (record && record.lastModified) {
        lastModifiedDays.push(record.lastModified);
      }
    }

    if (lastModifiedDays.length === 0) {
      return res.status(404).json({ error: 'No modification date found for this collection.' });
    }
    const lastModified = new Date(Math.max(...lastModifiedDays));
    res.json(lastModified)
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving last modification date.' });
  }
});


module.exports = router;