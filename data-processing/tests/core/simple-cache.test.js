const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const SimpleCache = require('../../lib/core/simple-cache');

describe('SimpleCache', () => {
  let cache;
  let tempDir;
  let mockLogger;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-cache-test-'));
    
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create cache instance
    cache = new SimpleCache({
      cacheDir: tempDir,
      logger: mockLogger
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('should use default values when no config provided', () => {
      const defaultCache = new SimpleCache();
      expect(defaultCache.cacheDir).toBe('./cache');
      expect(defaultCache.logger).toBe(console);
    });

    test('should use provided config values', () => {
      expect(cache.cacheDir).toBe(tempDir);
      expect(cache.logger).toBe(mockLogger);
    });
  });

  describe('set and get operations', () => {
    test('should store and retrieve data', async () => {
      const testData = { message: 'Hello, World!', number: 42 };
      
      await cache.set('test-key', testData);
      const retrieved = await cache.get('test-key');
      
      expect(retrieved).toEqual(testData);
      expect(mockLogger.debug).toHaveBeenCalledWith('Cached data for test-key');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache hit for test-key');
    });

    test('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent-key');
      
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache miss for non-existent-key');
    });

    test('should handle complex data structures', async () => {
      const complexData = {
        array: [1, 2, 3],
        nested: {
          object: {
            value: 'nested'
          }
        },
        nullValue: null,
        booleanValue: true
      };
      
      await cache.set('complex-key', complexData);
      const retrieved = await cache.get('complex-key');
      
      expect(retrieved).toEqual(complexData);
    });

    test('should create cache directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'cache');
      const nestedCache = new SimpleCache({
        cacheDir: nestedDir,
        logger: mockLogger
      });
      
      await nestedCache.set('test', { data: 'test' });
      
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });



  describe('invalidate operation', () => {
    test('should remove cached data', async () => {
      await cache.set('invalidate-test', { data: 'to be removed' });
      
      let exists = await cache.exists('invalidate-test');
      expect(exists).toBe(true);
      
      await cache.invalidate('invalidate-test');
      
      exists = await cache.exists('invalidate-test');
      expect(exists).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Invalidated cache for invalidate-test');
    });

    test('should handle invalidating non-existent cache gracefully', async () => {
      await expect(cache.invalidate('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear operation', () => {
    test('should remove all cached data', async () => {
      await cache.set('clear-test-1', { data: 1 });
      await cache.set('clear-test-2', { data: 2 });
      
      let exists1 = await cache.exists('clear-test-1');
      let exists2 = await cache.exists('clear-test-2');
      expect(exists1).toBe(true);
      expect(exists2).toBe(true);
      
      await cache.clear();
      
      exists1 = await cache.exists('clear-test-1');
      exists2 = await cache.exists('clear-test-2');
      expect(exists1).toBe(false);
      expect(exists2).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Cache cleared');
    });

    test('should recreate cache directory after clearing', async () => {
      await cache.set('test', { data: 'test' });
      await cache.clear();
      
      // Should be able to set data again
      await expect(cache.set('new-test', { data: 'new' })).resolves.not.toThrow();
      
      const retrieved = await cache.get('new-test');
      expect(retrieved).toEqual({ data: 'new' });
    });
  });

  describe('source file dependency checking', () => {
    let sourceFile1, sourceFile2;

    beforeEach(async () => {
      sourceFile1 = path.join(tempDir, 'source1.txt');
      sourceFile2 = path.join(tempDir, 'source2.txt');
      
      await fs.writeFile(sourceFile1, 'source content 1');
      await fs.writeFile(sourceFile2, 'source content 2');
    });

    test('should detect when source files are newer than cache', async () => {
      // Create cache
      await cache.set('dependency-test', { data: 'cached' });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update source file
      await fs.writeFile(sourceFile1, 'updated content');
      
      const isNewer = await cache.isSourceNewer('dependency-test', [sourceFile1]);
      expect(isNewer).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`Source file ${sourceFile1} is newer than cache dependency-test`)
      );
    });

    test('should detect when cache is up to date', async () => {
      // Create source files first
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then create cache
      await cache.set('up-to-date-test', { data: 'cached' });
      
      const isNewer = await cache.isSourceNewer('up-to-date-test', [sourceFile1, sourceFile2]);
      expect(isNewer).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache up-to-date-test is up to date with source files'
      );
    });

    test('should return true when cache does not exist', async () => {
      const isNewer = await cache.isSourceNewer('non-existent-cache', [sourceFile1]);
      expect(isNewer).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cache non-existent-cache does not exist, considering source newer'
      );
    });

    test('should return true when source file does not exist', async () => {
      await cache.set('missing-source-test', { data: 'cached' });
      
      const isNewer = await cache.isSourceNewer('missing-source-test', ['/non/existent/file.txt']);
      expect(isNewer).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('Source file not found: /non/existent/file.txt');
    });

    test('should check multiple source files', async () => {
      await cache.set('multi-source-test', { data: 'cached' });
      
      // Wait and update one source file
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.writeFile(sourceFile2, 'updated content 2');
      
      const isNewer = await cache.isSourceNewer('multi-source-test', [sourceFile1, sourceFile2]);
      expect(isNewer).toBe(true);
    });
  });

  describe('utility methods', () => {
    test('getCacheFilePath should return correct path', () => {
      const filePath = cache.getCacheFilePath('test-key');
      expect(filePath).toBe(path.join(tempDir, 'test-key.json'));
    });

    test('exists should return correct boolean', async () => {
      expect(await cache.exists('non-existent')).toBe(false);
      
      await cache.set('exists-test', { data: 'test' });
      expect(await cache.exists('exists-test')).toBe(true);
    });

    test('getMetadata should return cache information', async () => {
      const testData = { data: 'metadata test' };
      await cache.set('metadata-test', testData);
      
      const metadata = await cache.getMetadata('metadata-test');
      
      expect(metadata).toHaveProperty('size');
      expect(metadata).toHaveProperty('created');
      expect(metadata).toHaveProperty('modified');
      expect(typeof metadata.size).toBe('number');
      expect(metadata.created).toBeTruthy();
      expect(metadata.modified).toBeTruthy();
    });

    test('getMetadata should return null for non-existent cache', async () => {
      const metadata = await cache.getMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle write errors gracefully', async () => {
      // Create cache with invalid directory (read-only)
      const invalidCache = new SimpleCache({
        cacheDir: '/invalid/readonly/path',
        logger: mockLogger
      });
      
      await expect(invalidCache.set('test', { data: 'test' })).rejects.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cache write error for test:',
        expect.any(String)
      );
    });

    test('should handle corrupted cache files', async () => {
      const cacheFile = cache.getCacheFilePath('corrupted-test');
      
      // Create corrupted cache file
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, 'invalid json content');
      
      const result = await cache.get('corrupted-test');
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cache read error for corrupted-test:',
        expect.any(String)
      );
    });

    test('should handle clear errors gracefully', async () => {
      const invalidCache = new SimpleCache({
        cacheDir: '/invalid/readonly/path',
        logger: mockLogger
      });
      
      await expect(invalidCache.clear()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cache clear error:',
        expect.any(String)
      );
    });
  });
});