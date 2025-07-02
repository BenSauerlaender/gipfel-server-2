const mongoose = require('mongoose');
require('dotenv').config();
const Summit = require('../models/Summit');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

async function resetAllGpsPositions() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    const result = await Summit.updateMany({}, { $set: { 'gpsPosition.lng': null, 'gpsPosition.lat': null } });
    console.log(`Reset gpsPosition.lng and gpsPosition.lat to null for ${result.nModified || result.modifiedCount} summits.`);
    process.exit(0);
  } catch (err) {
    console.error('Error resetting gps positions:', err);
    process.exit(1);
  }
}

resetAllGpsPositions();
 