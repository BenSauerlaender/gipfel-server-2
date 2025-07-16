const path = require("path");
const fs = require("fs").promises;
const os = require("os");
const BaseSource = require("../../lib/sources/base-source");
const SimpleCache = require("../../lib/core/simple-cache");

// Create a concrete test class that extends BaseSource
class TestSource extends BaseSource {
  async fetch() {
    return "test data";
  }

  async parse(rawData) {
    return { data: rawData };
  }
}

describe("BaseSource Caching", () => {
  let source;
  let mockLogger;
  let cache;
  let tempDir;

  beforeEach(async () => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create temporary directory for cache
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "base-source-cache-test-")
    );

    cache = new SimpleCache({
      cacheDir: path.join(tempDir, "cache"),
      logger: mockLogger,
    });

    const config = {
      testConfig: "value",
      cache: { enabled: true },
    };

    source = new TestSource(config, mockLogger, cache);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("getCacheKey", () => {
    test("should generate base cache key", () => {
      const key = source.getCacheKey();
      expect(key).toMatch(/^testsource_[a-f0-9]{8}$/);
    });

    test("should generate consistent keys for same config", () => {
      const key1 = source.getCacheKey();
      const key2 = source.getCacheKey();

      expect(key1).toBe(key2);
    });

    test("should generate different keys for different configs", () => {
      const config1 = { testConfig: "value1" };
      const config2 = { testConfig: "value2" };

      const source1 = new TestSource(config1, mockLogger, cache);
      const source2 = new TestSource(config2, mockLogger, cache);

      expect(source1.getCacheKey()).not.toBe(source2.getCacheKey());
    });
  });

  describe("clearCache", () => {
    beforeEach(async () => {
      // Set up test cache entry
      await cache.set(source.getCacheKey(), { main: "data" });
    });

    test("should clear cache for this source", async () => {
      const mainKey = source.getCacheKey();

      // Verify cache exists
      expect(await cache.exists(mainKey)).toBe(true);

      // Clear cache
      await source.clearCache();

      // Cache should be cleared
      expect(await cache.exists(mainKey)).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Cleared cache for TestSource")
      );
    });

    test("should handle missing cache gracefully", async () => {
      const sourceWithoutCache = new TestSource({}, mockLogger, null);

      await expect(sourceWithoutCache.clearCache()).resolves.not.toThrow();
    });
  });

  describe("constructor", () => {
    test("should initialize cache properties correctly", () => {
      expect(source.cache).toBe(cache);
      expect(source.cacheEnabled).toBe(true);
    });

    test("should default cacheEnabled to true when not specified", () => {
      const sourceWithoutCacheConfig = new TestSource({}, mockLogger, cache);
      expect(sourceWithoutCacheConfig.cacheEnabled).toBe(true);
    });

    test("should respect cacheEnabled configuration", () => {
      const config = { cache: { enabled: false } };
      const sourceWithDisabledCache = new TestSource(config, mockLogger, cache);
      expect(sourceWithDisabledCache.cacheEnabled).toBe(false);
    });

    test("should handle missing cache parameter", () => {
      const sourceWithoutCache = new TestSource({}, mockLogger);
      expect(sourceWithoutCache.cache).toBeNull();
      expect(sourceWithoutCache.cacheEnabled).toBe(true);
    });
  });

  describe("getSourceFiles", () => {
    test("should return empty array by default", () => {
      const files = source.getSourceFiles();
      expect(files).toEqual([]);
    });
  });
});
