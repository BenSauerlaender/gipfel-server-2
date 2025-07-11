const express = require('express');
const CacheService = require('../services/cacheService');
const paths = require('../utill/resourcePaths');
const fs = require('fs');

const router = express.Router();

router.get('/fonts', (req, res) => {
  const compressedData = fs.readFileSync(paths.mapFontsPath);
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="fonts.tar.gz"');
  res.send(compressedData);
});
router.get('/sprite/png', (req, res) => {
  const spritePng = fs.readFileSync(paths.mapSpritePngPath);
  res.set('Content-Type', 'image/png');
  res.send(spritePng);
});
router.get('/sprite/json', (req, res) => {
  const spriteJson = fs.readFileSync(paths.mapSpriteJsonPath, 'utf8');
  res.set('Content-Type', 'application/json');
  res.send(JSON.parse(spriteJson));
});
router.get('/style', (req, res) => {
  const styleJson = fs.readFileSync(paths.mapStylePath, 'utf8');
  res.set('Content-Type', 'application/json');
  res.send(JSON.parse(styleJson));
});
router.get('/tiles', (req, res) => {
  const tilesData = fs.readFileSync(paths.mapTilesPath);
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="tiles.tar.gz"');
  res.send(tilesData);
});
module.exports = router;