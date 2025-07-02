const mongoose = require('mongoose');
const CacheService = require('./cacheService');

const setupChangeStreams = () => {
  const db = mongoose.connection.db;
  
  const changeStream = db.watch();
  
  changeStream.on('change', (change) => {
    const collectionName = change.ns.coll;
    console.log(`Database change detected in collection: ${collectionName}`);
    
    if(['ascents', 'climbers', 'regions', 'routes', 'summits'].includes(collectionName)){
        // Invalidate cache for the affected collection
        CacheService.clearAllCache()
    }
  });
  
  changeStream.on('error', (error) => {
    console.error('Change stream error:', error);
  });
  
  console.log('Change streams set up for automatic cache invalidation');
};

module.exports = { setupChangeStreams };