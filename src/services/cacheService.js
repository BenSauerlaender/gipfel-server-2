const cache = require('memory-cache');

const CACHE_PREFIX = process.env.CACHE_PREFIX

class CacheService {
  static generateCacheKey(endpoint) {
    return `${CACHE_PREFIX}${endpoint}`;
  }

  static get(key) {
    return cache.get(key);
  }

  static set(key, value) {
    cache.put(key, value);
    console.log(`Cache set for key: ${key}`);
  }

  static delete(key) {
    cache.del(key);
    console.log(`Cache deleted for key: ${key}`);
  }

  static invalidateEndpoint(endpoint) {
    const keys = cache.keys();
    const collectionKeys = keys.filter(key => 
      key.startsWith(`${CACHE_PREFIX}${endpoint}`)
    );
    
    collectionKeys.forEach(key => {
      cache.del(key);
    });
    
    console.log(`Invalidated ${collectionKeys.length} cache keys for endpoint: ${endpoint}`);
    return collectionKeys.length;
  }

  static clearAllCache() {
    cache.clear();
    console.log('All cache cleared');
  }

  static getStats() {
    const keys = cache.keys();
    return {
      totalKeys: keys.length,
      keys: keys,
      memoryUsage: process.memoryUsage()
    };
  }
}

module.exports = CacheService;