const CacheService = require('../services/cacheService');

// Cache middleware for custom computations
const cache = (endpoint, computationFunction) => {
  return async (req, res, next) => {
    try {
      const cacheKey = CacheService.generateCacheKey(endpoint);
      
      // Check cache
      const cachedData = CacheService.get(cacheKey);
      if (cachedData) {
        console.log(`Cache hit for: ${cacheKey}`);
        return res.json(cachedData);
      }
      
      // Compute data
      console.log(`Computing data for: ${cacheKey}`);
      const result = await computationFunction(req,res);
      
      // Cache result
      CacheService.set(cacheKey, result);
      
      res.json(result);
    } catch (error) {
      console.log(error)
      res.status(500).json();
    }
  };
};

module.exports = {
  cache
};