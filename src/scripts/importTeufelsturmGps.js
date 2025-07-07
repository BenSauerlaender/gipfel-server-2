const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();
const Summit = require('../models/Summit');
const generateMongoUri = require('../utill/mongoUri');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const mongoUri = generateMongoUri();
const inputPath = 'data/teufelsturm/teufelsturm-gps.json';

const RED = (text) => `\x1b[31m${text}\x1b[0m`;
const YELLOW = (text) => `\x1b[33m${text}\x1b[0m`;

async function importTeufelsturmGps() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    let updatedCount = 0;
    let skippedCount = 0;
    for (const entry of data) {
      if ( entry.lng == null || entry.lat == null) {
        skippedCount++;
        continue;
      }
      const summit = await Summit.findOne({ name: entry.name });
      if (!summit) {
        console.warn(YELLOW(`Summit not found: ${entry.name}`));
        skippedCount++;
        continue;
      }
      if (!summit.gpsPosition || summit.gpsPosition.lng !== entry.lng || summit.gpsPosition.lat !== entry.lat) {
        summit.gpsPosition = { lng: entry.lng, lat: entry.lat };
        await summit.save();
        updatedCount++;
        console.log(`Updated ${summit.name}: lng=${entry.lng}, lat=${entry.lat}`);
      }
    }
    console.log(`Done. Updated ${updatedCount} summits from teufelsturm-gps.json, skipped ${skippedCount}.`);
    process.exit(0);
  } catch (err) {
    console.error(RED('Error importing teufelsturm GPS:'), err);
    process.exit(1);
  }
}

importTeufelsturmGps(); 