const express = require('express');
const CacheService = require('../services/cacheService');
const { authenticate, isAdmin } = require('../middleware/auth');
const { mapFontsPath } = require('../utill/resourcePaths');
const fs = require('fs');

const router = express.Router();

router.use(authenticate);

router.get('/fonts', (req, res) => {
  const compressedData = fs.readFileSync(mapFontsPath);
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="fonts.tar.gz"');
  res.send(compressedData);
});

module.exports = router;