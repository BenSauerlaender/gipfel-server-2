const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();
const Summit = require('../models/Summit');
const generateMongoUri = require('../utill/mongoUri');

const mongoUri = generateMongoUri();
const geojsonPath = 'data/osm/export.geojson';

const RED = (text) => `\x1b[31m${text}\x1b[0m`;
const YELLOW = (text) => `\x1b[33m${text}\x1b[0m`;

function normalizeName(name) {
  return name ? name.trim().toLowerCase() : '';
}

async function updateGpsFromOsm() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    const features = geojson.features;
    // Build a lookup by normalized name
    const featureByName = {};
    for (const f of features) {
      if (f.properties) {
        if (f.properties.name) featureByName[normalizeName(f.properties.name)] = f;
        if (f.properties['name:de']) featureByName[normalizeName(f.properties['name:de'])] = f;
      }
    }
    const summits = await Summit.find();
    let updatedCount = 0;

    const summitsNotFound = [];

    for (const summit of summits) {
      const summitName = normalizeName(summit.name);
      const feature = featureByName[summitName];
      if (feature && feature.geometry && feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        if (!summit.gpsPosition || summit.gpsPosition.lng !== lng || summit.gpsPosition.lat !== lat) {
          summit.gpsPosition = { lng, lat };
          await summit.save();
          updatedCount++;
          console.log(`Updated ${summit.name}: lng=${lng}, lat=${lat}`);
        }
      } else {
        summitsNotFound.push(summit.name);
      }
    }
    console.log(`Done. Updated ${updatedCount} summits from OSM.`);
    summitsNotFound.forEach((name) => console.warn(YELLOW(`Summit not found in OSM: ${name}`)));
    process.exit(0);
  } catch (err) {
    console.error(RED('Error updating Summits from OSM:'), err);
    process.exit(1);
  }
}

updateGpsFromOsm(); 