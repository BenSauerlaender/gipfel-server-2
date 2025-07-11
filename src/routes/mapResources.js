const express = require('express');
const CacheService = require('../services/cacheService');
const paths = require('../utill/resourcePaths');
const fs = require('fs');

const router = express.Router();

router.get('/fonts', (req, res) => {
  // Check if file exists
  if (!fs.existsSync(paths.mapFontsPath)) {
    return res.status(404).send('File not found');
  }

  const compressedData = fs.readFileSync(paths.mapFontsPath);
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="fonts.tar.gz"');
  res.send(compressedData);
});
router.get('/sprite/png', (req, res) => {
  // Check if file exists
  if (!fs.existsSync(paths.mapSpritePngPath)) {
    return res.status(404).send('File not found');
  }
  res.set('Content-Type', 'image/png');
    // Stream the file
  const fileStream = fs.createReadStream(paths.mapSpritePngPath);
  fileStream.pipe(res);

  // Optional: handle stream errors
  fileStream.on('error', (err) => {
    res.status(500).send('Error reading file');
  });
});
router.get('/sprite/json', (req, res) => {
  // Check if file exists
  if (!fs.existsSync(paths.mapSpriteJsonPath)) {
    return res.status(404).send('File not found');
  }
  const spriteJson = fs.readFileSync(paths.mapSpriteJsonPath, 'utf8');
  res.set('Content-Type', 'application/json');
  res.send(JSON.parse(spriteJson));
});
router.get('/style', (req, res) => {
  // Check if file exists
  if (!fs.existsSync(paths.mapStylePath)) {
    return res.status(404).send('File not found');
  }
  const styleJson = fs.readFileSync(paths.mapStylePath, 'utf8');
  res.set('Content-Type', 'application/json');
  res.send(JSON.parse(styleJson));
});
router.get('/tiles', (req, res) => {
  // Check if file exists
  if (!fs.existsSync(paths.mapTilesPath)) {
    return res.status(404).send('File not found');
  }
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="tiles.tar.gz"');
  // Stream the file
  const fileStream = fs.createReadStream(paths.mapTilesPath);
  fileStream.pipe(res);

  // Optional: handle stream errors
  fileStream.on('error', (err) => {
    res.status(500).send('Error reading file');
  });
});
module.exports = router;