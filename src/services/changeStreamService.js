const mongoose = require('mongoose');
const CacheService = require('./cacheService');
const LastChange = require('../models/LastChange');

const collectionsToTrack = ['ascents', 'climbers', 'regions', 'routes', 'summits', 'users'];

const setupChangeStreams = () => {
  const db = mongoose.connection.db;

  const changeStream = db.watch();

  changeStream.on('change', async (change) => {
    const collectionName = change.ns.coll;
    console.log(`Database change detected in collection: ${collectionName}`);

    if (collectionsToTrack.includes(collectionName)) {
      // Invalidate cache for the affected collection
      CacheService.clearAllCache();

      // Update the LastChange collection
      const now = new Date();
      await LastChange.findOneAndUpdate(
        { collectionName },
        { lastModified: now },
        { upsert: true }
      );
      console.log(`Updated last modified date for ${collectionName}: ${now}`);
    }
  });

  changeStream.on('error', (error) => {
    console.error('Change stream error:', error);
  });

  console.log('Change streams set up for automatic cache invalidation');
};

module.exports = { setupChangeStreams };