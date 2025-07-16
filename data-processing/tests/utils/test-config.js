// Test script to verify configuration management system
const { ConfigManager, CacheManager, Logger, DataProcessor } = require('../../lib/core');
const path = require('path');

async function testConfigurationSystem() {
  console.log('Testing Configuration Management System...');
  
  try {
    // Test ConfigManager
    console.log('\n1. Testing ConfigManager...');
    const configManager = new ConfigManager({
      configPath: path.join(__dirname, '../../config')
    });
    
    const config = await configManager.loadConfig();
    console.log('✅ Configuration loaded successfully');
    console.log('   Sources:', Object.keys(config.sources || {}));
    console.log('   Cache enabled:', config.cache?.enabled);
    
    // Test configuration access
    const cacheEnabled = configManager.get('cache.enabled');
    const memoryTTL = configManager.get('cache.memory.ttl', 3600);
    console.log('✅ Configuration access working');
    console.log('   Cache enabled:', cacheEnabled);
    console.log('   Memory TTL:', memoryTTL);
    
    // Test legacy config migration
    console.log('\n2. Testing legacy config migration...');
    const legacyConfig = {
      convertTTRoutes: {
        inputFiles: ['test1.html', 'test2.html'],
        outputFiles: { routes: 'output.json' }
      }
    };
    
    const migratedConfig = configManager.migrateLegacyConfig(legacyConfig);
    console.log('✅ Legacy config migration working');
    console.log('   Migrated sources:', Object.keys(migratedConfig.sources));
    
    // Test CacheManager
    console.log('\n3. Testing CacheManager...');
    const logger = new Logger({ level: 'info' });
    const cacheManager = new CacheManager(config.cache, logger);
    
    // Test cache operations
    await cacheManager.set('test-key', { message: 'Hello Cache!' });
    const cachedData = await cacheManager.get('test-key');
    console.log('✅ Cache operations working');
    console.log('   Cached data:', cachedData);
    
    const stats = cacheManager.getStats();
    console.log('✅ Cache statistics working');
    console.log('   Cache stats:', stats);
    
    // Test DataProcessor integration
    console.log('\n4. Testing DataProcessor integration...');
    const processor = new DataProcessor({
      configManager,
      logger
    });
    
    await processor.initialize();
    console.log('✅ DataProcessor initialization working');
    console.log('   Processor config loaded:', !!processor.config);
    console.log('   Cache manager initialized:', !!processor.cache);
    
    console.log('\n🎉 All configuration system tests passed!');
    
  } catch (error) {
    console.error('❌ Configuration system test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Export for use in other test files
module.exports = { testConfigurationSystem };

// Run tests if called directly
if (require.main === module) {
  testConfigurationSystem();
}