const DataProcessor = require("../../lib/core/processor");
const Logger = require("../../lib/core/logger");

// Mock dependencies
jest.mock("../../lib/core/logger");

describe("DataProcessor", () => {
  let processor;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    Logger.mockImplementation(() => mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      processor = new DataProcessor();

      expect(processor.sources).toBeInstanceOf(Map);
      expect(processor.transformers).toBeInstanceOf(Map);
      expect(processor.importers).toBeInstanceOf(Map);
      expect(processor.processingStats).toBeDefined();
      expect(processor.processingStats.totalSources).toBe(0);
      expect(processor.config).toBeDefined();
    });

    it("should initialize processing stats correctly", () => {
      processor = new DataProcessor();

      const stats = processor.processingStats;
      expect(stats.startTime).toBeNull();
      expect(stats.endTime).toBeNull();
      expect(stats.totalSources).toBe(0);
      expect(stats.processedSources).toBe(0);
      expect(stats.successfulSources).toBe(0);
      expect(stats.failedSources).toBe(0);
      expect(stats.skippedSources).toBe(0);
      expect(stats.totalRecords).toBe(0);
      expect(stats.errors).toEqual([]);
      expect(stats.warnings).toEqual([]);
    });

    it("should validate config during construction", () => {
      const config = {
        sources: {
          testSource: { enabled: true },
        },
      };

      processor = new DataProcessor({ config });

      expect(processor.config.sources.testSource.enabled).toBe(true);
      expect(processor.config.cache.enabled).toBe(true);
      expect(processor.config.cache.path).toBe("./cache");
    });

    it("should throw error for invalid config", () => {
      expect(() => {
        new DataProcessor({ config: "invalid" });
      }).toThrow("Configuration must be an object");
    });

    it("should throw error for invalid source config", () => {
      expect(() => {
        new DataProcessor({
          config: {
            sources: {
              testSource: { enabled: "not-boolean" },
            },
          },
        });
      }).toThrow("Source 'testSource' must have an enabled boolean property");
    });
  });

  // Note: initialize() method has been removed - configuration happens in constructor

  describe("processSource", () => {
    it("should skip disabled sources", async () => {
      const config = {
        sources: {
          "disabled-source": {
            enabled: false,
            config: { inputFile: "test.json" },
          },
        },
      };

      processor = new DataProcessor({ config });
      const result = await processor.processSource("disabled-source");

      expect(result.status).toBe("skipped");
      expect(result.reason).toBe("disabled");
      expect(result.source).toBe("disabled-source");
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(processor.processingStats.skippedSources).toBe(1);
    });

    it("should throw error for non-existent source", async () => {
      processor = new DataProcessor();

      await expect(processor.processSource("non-existent")).rejects.toThrow(
        "Source configuration not found: non-existent"
      );
      expect(processor.processingStats.errors).toHaveLength(1);
      expect(processor.processingStats.failedSources).toBe(1);
    });

    it("should throw error for missing source handler", async () => {
      const config = {
        sources: {
          "test-source": {
            enabled: true,
            config: { inputFile: "test.json" },
          },
        },
      };

      processor = new DataProcessor({ config });

      await expect(processor.processSource("test-source")).rejects.toThrow(
        "Source class not found for: test-source"
      );
      expect(processor.processingStats.errors).toHaveLength(1);
      expect(processor.processingStats.failedSources).toBe(1);
    });

    it("should attempt to process valid source configuration", async () => {
      const config = {
        sources: {
          "test-source": {
            enabled: true,
            config: { inputFile: "test.json" },
          },
        },
      };

      processor = new DataProcessor({ config });

      // This test verifies the processor logic up to source instantiation
      // It will fail at source creation since we don't mock the actual sources module
      await expect(processor.processSource("test-source")).rejects.toThrow(
        "Source class not found for: test-source"
      );

      // Verify the processor tracked the attempt correctly
      expect(processor.processingStats.failedSources).toBe(1);
      expect(processor.processingStats.processedSources).toBe(1);
    });
  });

  describe("processAll", () => {
    it("should process all sources and generate summary", async () => {
      const config = {
        sources: {
          "unknown-source1": {
            enabled: true,
            config: { inputFile: "test.json" },
          },
          "disabled-source": {
            enabled: false,
            config: { inputFiles: ["test.html"] },
          },
          "unknown-source2": {
            enabled: true,
            config: { inputFile: "test.geojson" },
          },
        },
      };

      processor = new DataProcessor({ config });
      const summary = await processor.processAll();

      expect(summary.summary.totalSources).toBe(3);
      expect(summary.summary.successfulSources).toBe(0); // All unknown sources will fail
      expect(summary.summary.skippedSources).toBe(1); // disabled-source is disabled
      expect(summary.summary.failedSources).toBe(2); // Both unknown sources will fail
      expect(summary.results).toHaveLength(3);
      expect(summary.startTime).toBeInstanceOf(Date);
      expect(summary.endTime).toBeInstanceOf(Date);
    });

    it("should handle errors gracefully and continue processing", async () => {
      const config = {
        sources: {
          "unknown-source1": {
            enabled: true,
            config: { inputFile: "test.json" },
          },
          "disabled-source": {
            enabled: false,
            config: { inputFiles: ["test.html"] },
          },
          "unknown-source2": {
            enabled: true,
            config: { inputFile: "test.geojson" },
          },
        },
      };

      processor = new DataProcessor({ config });
      const summary = await processor.processAll();

      expect(summary.summary.totalSources).toBe(3);
      expect(summary.summary.successfulSources).toBe(0); // No sources will succeed
      expect(summary.summary.skippedSources).toBe(1); // disabled-source is disabled
      expect(summary.summary.failedSources).toBe(2); // Both unknown sources fail
      expect(summary.results).toHaveLength(3);

      // Check that error results exist
      const errorResults = summary.results.filter((r) => r.status === "error");
      expect(errorResults).toHaveLength(2);
    });
  });

  describe("registration methods", () => {
    it("should register source handlers", () => {
      processor = new DataProcessor({ logger: mockLogger });
      const mockSource = { type: "test" };
      processor.registerSource("test", mockSource);

      expect(processor.sources.get("test")).toBe(mockSource);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Registered source handler: test"
      );
    });

    it("should register transformers", () => {
      processor = new DataProcessor({ logger: mockLogger });
      const mockTransformer = { type: "test" };
      processor.registerTransformer("test", mockTransformer);

      expect(processor.transformers.get("test")).toBe(mockTransformer);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Registered transformer: test"
      );
    });

    it("should register importers", () => {
      processor = new DataProcessor({ logger: mockLogger });
      const mockImporter = { type: "test" };
      processor.registerImporter("test", mockImporter);

      expect(processor.importers.get("test")).toBe(mockImporter);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Registered importer: test"
      );
    });
  });

  describe("getProcessingStats", () => {
    it("should return copy of processing stats", () => {
      const stats = processor.getProcessingStats();

      expect(stats).toEqual(processor.processingStats);
      expect(stats).not.toBe(processor.processingStats); // Should be a copy
    });
  });

  describe("progress tracking", () => {
    it("should track progress correctly during processing", async () => {
      const config = {
        sources: {
          "unknown-source": {
            enabled: true,
            config: { inputFile: "test.json" },
          },
        },
      };

      processor = new DataProcessor({ config });

      // This will fail but we can test that progress is tracked
      await expect(processor.processSource("unknown-source")).rejects.toThrow(
        "Source class not found for: unknown-source"
      );

      const stats = processor.getProcessingStats();
      expect(stats.processedSources).toBe(1);
      expect(stats.successfulSources).toBe(0);
      expect(stats.failedSources).toBe(1);
      expect(stats.skippedSources).toBe(0);
      expect(stats.errors).toHaveLength(1);
    });
  });
});
