const mongoose = require('mongoose');
require('dotenv').config();
const LastChange = require('../models/LastChange');
const generateMongoUri = require('../utill/mongoUri');

const mongoUri = generateMongoUri();

const collectionsToSeed = ['ascents', 'climbers', 'regions', 'routes', 'summits', 'users'];

async function seedLastUpdate() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const now = new Date();

    for (const collectionName of collectionsToSeed) {
      await LastChange.findOneAndUpdate(
        { collectionName },
        { lastModified: now },
        { upsert: true }
      );
      console.log(`Seeded lastModified for collection: ${collectionName}`);
    }

    console.log('Successfully seeded lastModified for all collections');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding lastModified:', err);
    process.exit(1);
  }
}

seedLastUpdate();
