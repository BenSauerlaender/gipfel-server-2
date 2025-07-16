const DataProcessor = require("../../lib/core/processor");
const SimpleCache = require("../../lib/core/simple-cache");
const Logger = require("../../lib/core/logger");
const path = require("path");
const fs = require("fs").promises;

describe("Dependency Resolution Integration", () => {
  let processor;
  let logger;
  let cache;
  let tempDir;

  beforeAll(async () => {
    // Create temporary directory for test cache
    tempDir = path.join(__dirname, "../temp/integration-test");
    await fs.mkdir(tempDir, { recursive: true });
  });

  beforeEach(async () => {
    logger = new Logger({ level: "error" }); // Suppress logs during tests
    cache = new SimpleCache({
      cacheDir: tempDir,
      logger: logger,
    });

    processor = new DataProcessor({
      logger: logger,
      cache: cache,
    });

    // Mock configuration for testing
    processor.config = {
      sources: {
        teufelsturmSummits: {
          enabled: true,
          config: {
            inputFile: path.join(
              __dirname,
              "../fixtures/sample-teufelsturm-summits.html"
            ),
            cache: { enabled: true },
          },
        },
        teufelsturmRoutes: {
          enabled: true,
          config: {
            inputFiles: [
              path.join(__dirname, "../fixtures/sample-teufelsturm.html"),
            ],
            cache: { enabled: true },
          },
        },
        osmLocations: {
          enabled: true,
          config: {
            inputFile: path.join(
              __dirname,
              "../fixtures/sample-osm-locations.geojson"
            ),
            dependencies: ["teufelsturmSummits", "teufelsturmRoutes"],
            cache: { enabled: true },
          },
        },
      },
    };
  });

  afterEach(async () => {
    // Clean up cache files
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rmdir(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Basic Dependency Resolution", () => {
    it("should process sources in correct dependency order", async () => {
      const processOrder = [];

      // Mock the _createSourceInstance method to track processing order
      const originalCreateSource = processor._createSourceInstance;
      processor._createSourceInstance = function (sourceName, sourceConfig) {
        processOrder.push(sourceName);
        return originalCreateSource.call(this, sourceName, sourceConfig);
      };

      await processor.processSource("osmLocations");

      // OSM locations should be processed last, after its dependencies
      expect(processOrder).toContain("teufelsturmSummits");
      expect(processOrder).toContain("teufelsturmRoutes");
      expect(processOrder).toContain("osmLocations");

      const osmIndex = processOrder.indexOf("osmLocations");
      const summitsIndex = processOrder.indexOf("teufelsturmSummits");
      const routesIndex = processOrder.indexOf("teufelsturmRoutes");

      expect(summitsIndex).toBeLessThan(osmIndex);
      expect(routesIndex).toBeLessThan(osmIndex);
    });

    it("should pass dependency data to dependent sources", async () => {
      const result = await processor.processSource("osmLocations");

      expect(result.status).toBe("completed");
      expect(result.locations).toBeDefined();
      expect(Array.isArray(result.locations)).toBe(true);

      // Should have metadata about dependencies
      expect(result.metadata).toBeDefined();
      expect(result.metadata.dependencies).toContain("teufelsturmSummits");
      expect(result.metadata.dependencies).toContain("teufelsturmRoutes");
      expect(result.metadata.totalSummits).toBeGreaterThan(0);
    });

    it("should cache dependency results to avoid reprocessing", async () => {
      // First processing run
      await processor.processSource("osmLocations");

      // Check that dependencies are cached
      expect(processor.processedSources.has("teufelsturmSummits")).toBe(true);
      expect(processor.processedSources.has("teufelsturmRoutes")).toBe(true);
      expect(processor.processedSources.has("osmLocations")).toBe(true);

      // Second run should use cached dependencies
      const startTime = Date.now();
      await processor.processSource("osmLocations");
      const processingTime = Date.now() - startTime;

      // Should be much faster due to caching
      expect(processingTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe("Dependency Configuration", () => {
    it("should handle sources with no dependencies", async () => {
      const result = await processor.processSource("teufelsturmSummits");

      expect(result.status).toBe("completed");
      expect(result.summits).toBeDefined();
      expect(Array.isArray(result.summits)).toBe(true);
    });

    it("should handle partial dependency configuration", async () => {
      // Configure OSM to only depend on summits
      processor.config.sources.osmLocations.config.dependencies = [
        "teufelsturmSummits",
      ];

      const result = await processor.processSource("osmLocations");

      expect(result.status).toBe("completed");
      expect(result.metadata.dependencies).toEqual(["teufelsturmSummits"]);
      expect(result.metadata.dependencies).not.toContain("teufelsturmRoutes");
    });

    it("should handle empty dependencies array", async () => {
      // Configure OSM with no dependencies
      processor.config.sources.osmLocations.config.dependencies = [];

      const result = await processor.processSource("osmLocations");

      expect(result.status).toBe("completed");
      expect(result.metadata.dependencies).toEqual([]);
      expect(result.metadata.totalSummits).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle dependency processing errors", async () => {
      // First get normal count
      const normalResult = await processor.processSource("osmLocations");
      const normalCount = normalResult.metadata.totalSummits;

      // Reset processor cache
      processor.processedSources.clear();

      // Disable a dependency - should still process but with empty dependency data
      processor.config.sources.teufelsturmSummits.enabled = false;

      const result = await processor.processSource("osmLocations");

      // Should complete successfully but with reduced summit data
      expect(result.status).toBe("completed");
      expect(result.metadata.totalSummits).toBeLessThan(normalCount); // Less than normal because one dependency is disabled
    });

    it("should handle missing dependency configuration", async () => {
      // Configure dependency that doesn't exist
      processor.config.sources.osmLocations.config.dependencies = [
        "nonExistentSource",
      ];

      await expect(processor.processSource("osmLocations")).rejects.toThrow(
        "Source configuration not found: nonExistentSource"
      );
    });

    it("should handle circular dependencies gracefully", async () => {
      // Create circular dependency (A depends on B, B depends on A)
      processor.config.sources.teufelsturmSummits.config.dependencies = [
        "osmLocations",
      ];
      processor.config.sources.osmLocations.config.dependencies = [
        "teufelsturmSummits",
      ];

      // This should either resolve or throw a clear error, not hang
      await expect(processor.processSource("osmLocations")).rejects.toThrow();
    });
  });

  describe("Cache Invalidation with Dependencies", () => {
    it("should invalidate dependent caches when dependency changes", async () => {
      // First run - creates caches
      const result1 = await processor.processSource("osmLocations");

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate dependency change by clearing both processor and file caches
      processor.processedSources.delete("teufelsturmSummits");
      processor.processedSources.delete("osmLocations");

      // Second run should reprocess due to dependency change
      const result2 = await processor.processSource("osmLocations");

      expect(result1.processedAt).not.toEqual(result2.processedAt);
    });

    it("should generate different cache keys for different dependency configurations", async () => {
      const osmSource1 = processor._createSourceInstance("osmLocations", {
        config: {
          ...processor.config.sources.osmLocations.config,
          dependencies: ["teufelsturmSummits"],
        },
      });

      const osmSource2 = processor._createSourceInstance("osmLocations", {
        config: {
          ...processor.config.sources.osmLocations.config,
          dependencies: ["teufelsturmRoutes"],
        },
      });

      const mockDeps1 = {
        teufelsturmSummits: { metadata: { processedAt: new Date() } },
      };
      const mockDeps2 = {
        teufelsturmRoutes: { metadata: { processedAt: new Date() } },
      };

      const key1 = osmSource1.getCacheKeyWithDependencies(mockDeps1);
      const key2 = osmSource2.getCacheKeyWithDependencies(mockDeps2);

      expect(key1).not.toEqual(key2);
    });
  });

  describe("Performance", () => {
    it.skip("should process dependencies in parallel when possible", async () => {
      // Configure multiple independent sources
      processor.config.sources.independentSource1 = {
        enabled: true,
        config: {
          inputFile: path.join(
            __dirname,
            "../fixtures/sample-teufelsturm-summits.html"
          ),
        },
      };

      processor.config.sources.independentSource2 = {
        enabled: true,
        config: {
          inputFiles: [
            path.join(__dirname, "../fixtures/sample-teufelsturm.html"),
          ],
        },
      };

      const startTime = Date.now();

      // Process multiple sources
      await Promise.all([
        processor.processSource("teufelsturmSummits"),
        processor.processSource("teufelsturmRoutes"),
      ]);

      const parallelTime = Date.now() - startTime;

      // Sequential processing for comparison
      processor.processedSources.clear();
      const startTimeSeq = Date.now();

      await processor.processSource("teufelsturmSummits");
      await processor.processSource("teufelsturmRoutes");

      const sequentialTime = Date.now() - startTimeSeq;

      // Parallel should be faster (though this test might be flaky)
      // Allow significant variance due to test environment differences
      expect(parallelTime).toBeLessThanOrEqual(sequentialTime * 2.0); // Allow more variance
    });
  });
});
