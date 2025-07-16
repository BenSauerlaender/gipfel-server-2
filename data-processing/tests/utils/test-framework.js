// Simple test to verify the framework structure works
const { DataProcessor, Logger, ProcessingError } = require('../../lib/core');
const { BaseSource } = require('../../lib/sources');
const { BaseTransformer } = require('../../lib/transformers');
const { BaseImporter } = require('../../lib/importers');

function testFrameworkStructure() {
  console.log('Testing framework instantiation...');

  try {
    // Test Logger
    const logger = new Logger({ level: 'info' });
    logger.info('Logger test successful');
    
    // Test ProcessingError
    const error = new ProcessingError('Test error', 'TEST_ERROR', 'test-source');
    console.log('ProcessingError created:', error.getFormattedMessage());
    
    // Test DataProcessor
    const config = {
      sources: {},
      transformers: {},
      importers: {}
    };
    const processor = new DataProcessor({ config });
    console.log('DataProcessor created successfully');
    
    // Test base classes
    const source = new BaseSource({}, logger);
    const transformer = new BaseTransformer({}, logger);
    const importer = new BaseImporter({}, logger);
    
    console.log('Base classes instantiated successfully');
    console.log('✅ Framework structure test passed!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Framework structure test failed:', error.message);
    return false;
  }
}

// Export for use in other test files
module.exports = { testFrameworkStructure };

// Run tests if called directly
if (require.main === module) {
  const success = testFrameworkStructure();
  process.exit(success ? 0 : 1);
}