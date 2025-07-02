const express = require('express');
const CacheService = require('../services/cacheService');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(isAdmin);

// GET /api/admin/cache/stats - Get cache statistics
router.get('/cache/stats', (req, res) => {
  const stats = CacheService.getStats();
  res.json(stats);
});

// DELETE /api/admin/cache - Clear all cache
router.delete('/cache', (req, res) => {
  CacheService.clearAllCache();
  res.json({ message: 'All cache cleared successfully' });
});

module.exports = router;