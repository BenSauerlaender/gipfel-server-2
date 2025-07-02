const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();
const Summit = require('../models/Summit');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;
const geojsonPath = 'data/osm/export.geojson';
const MAX_DISTANCE_METERS = 100; // Change this value as needed

const RED = (text) => `\x1b[31m${text}\x1b[0m`;
const YELLOW = (text) => `\x1b[33m${text}\x1b[0m`;

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run');

function normalizeName(name) {
  return name ? name.trim().toLowerCase() : '';
}

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fixGpsByOsm() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    const features = geojson.features;
    const featureByName = {};
    for (const f of features) {
      if (f.properties) {
        if (f.properties.name) featureByName[normalizeName(f.properties.name)] = f;
        if (f.properties['name:de']) featureByName[normalizeName(f.properties['name:de'])] = f;
      }
    }
    const summits = await Summit.find();
    let updatedCount = 0;
    let skippedCount = 0;
    let notFound = [];
    let updateCandidates = [];
    let distanceSum = 0;
    for (const summit of summits) {
      const summitName = normalizeName(summit.name);
      const feature = featureByName[summitName];
      if (feature && feature.geometry && feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates;
        if (
          summit.gpsPosition &&
          summit.gpsPosition.lat != null &&
          summit.gpsPosition.lng != null
        ) {
          const dist = haversine(summit.gpsPosition.lat, summit.gpsPosition.lng, lat, lng);
          if (dist <= MAX_DISTANCE_METERS) {
            if (summit.gpsPosition.lat !== lat || summit.gpsPosition.lng !== lng) {
              updateCandidates.push({ name: summit.name, lat, lng, dist });
              distanceSum += dist;
              if (!isDryRun) {
                summit.gpsPosition = { lat, lng };
                await summit.save();
                updatedCount++;
                console.log(`Updated ${summit.name}: lat=${lat}, lng=${lng} (distance: ${dist.toFixed(2)}m)`);
              }
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
            console.warn(YELLOW(`Skipped ${summit.name}: OSM position too far (${dist.toFixed(2)}m)`));
          }
        } else {
          skippedCount++;
          console.warn(YELLOW(`Skipped ${summit.name}: No current gpsPosition`));
        }
      } else {
        notFound.push(summit.name);
      }
    }
    if (isDryRun) {
      console.log(`\n[DRY RUN] ${updateCandidates.length} summits would be updated.`);
      if (updateCandidates.length > 0) {
        const avgDist = distanceSum / updateCandidates.length;
        console.log(`[DRY RUN] Average update distance: ${avgDist.toFixed(2)}m`);
      }
    } else {
      console.log(`Done. Updated ${updatedCount}, skipped ${skippedCount}.`);
    }
    if (notFound.length) {
      notFound.forEach((name) => console.warn(YELLOW(`Summit not found in OSM: ${name}`)));
    }
    process.exit(0);
  } catch (err) {
    console.error(RED('Error fixing GPS by OSM:'), err);
    process.exit(1);
  }
}

fixGpsByOsm(); 