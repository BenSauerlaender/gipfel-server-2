const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const ClimbersSource = require("../../lib/sources/climbers-source");
const SimpleCache = require("../../lib/core/simple-cache");
const ProcessingError = require("../../lib/core/error");

describe("ClimbersSource", () => {
  let tempDir;
  let mockLogger;
  let cache;
  let testInputFile;
  let fixtureFile;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "climbers-source-test-"));

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create cache instance
    cache = new SimpleCache({
      cacheDir: path.join(tempDir, "cache"),
      logger: mockLogger,
    });

    // Create test input file
    testInputFile = path.join(tempDir, "test-climbers.json");

    // Use test fixture file
    fixtureFile = path.join(__dirname, "../fixtures/sample-climbers.json");
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    test("should throw error when no input files configured", () => {
      expect(() => {
        new ClimbersSource({}, mockLogger, cache);
      }).toThrow(ProcessingError);
      expect(() => {
        new ClimbersSource({}, mockLogger, cache);
      }).toThrow(
        "ClimbersSource requires either inputFile or inputFiles to be configured"
      );
    });

    test("should use provided single file configuration", () => {
      const config = {
        inputFile: "/custom/path/climbers.json",
        cache: { enabled: false },
      };
      const source = new ClimbersSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual(["/custom/path/climbers.json"]);
      expect(source.cacheEnabled).toBe(false);
    });

    test("should use provided multiple files configuration", () => {
      const config = {
        inputFiles: ["/path/file1.json", "/path/file2.json"],
        cache: { enabled: true },
      };
      const source = new ClimbersSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual([
        "/path/file1.json",
        "/path/file2.json",
      ]);
      expect(source.cacheEnabled).toBe(true);
    });
  });

  describe("fetch", () => {
    test("should successfully read valid JSON file", async () => {
      const testData = ["Alice", "Bob", "Charlie"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.fetch();

      expect(result).toEqual([
        {
          filePath: testInputFile,
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[ClimbersSource] fetch: Reading climbers data from 1 files"
        ),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[ClimbersSource] fetch: Successfully read"),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError when file does not exist", async () => {
      const source = new ClimbersSource(
        { inputFile: "/non/existent/file.json" },
        mockLogger
      );

      await expect(source.fetch()).rejects.toThrow(ProcessingError);
      await expect(source.fetch()).rejects.toThrow(
        "ENOENT: no such file or directory, open '/non/existent/file.json'"
      );
    });

    test("should throw ProcessingError with correct category", async () => {
      const source = new ClimbersSource(
        { inputFile: "/non/existent/file.json" },
        mockLogger
      );

      try {
        await source.fetch();
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessingError);
        expect(error.category).toBe(ProcessingError.Categories.SOURCE_ERROR);
        expect(error.source).toBe("ClimbersSource");
      }
    });
  });

  describe("parse", () => {
    test("should parse valid climbers array into object with metadata", async () => {
      const testData = ["Alice Smith", "Bob Jones", "Charlie Brown"];
      const fileDataArray = [
        {
          filePath: "/test/climbers.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      expect(result).toHaveProperty("climbers");
      expect(result).toHaveProperty("metadata");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
        { firstName: "Charlie", lastName: "Brown" },
      ]);
      expect(result.climbers).toHaveLength(3);
      expect(result.metadata).toHaveProperty("totalProcessed", 3);
      expect(result.metadata).toHaveProperty("processedAt");
      expect(result.metadata).toHaveProperty("sourceFiles", [
        "/test/climbers.json",
      ]);
    });

    test("should trim whitespace from names", async () => {
      const testData = ["  Alice Smith  ", "\tBob\n", " Charlie "];
      const fileDataArray = [
        {
          filePath: "/test/climbers.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      expect(result).toHaveProperty("climbers");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "" },
        { firstName: "Charlie", lastName: "" },
      ]);
    });

    test("should throw ProcessingError for invalid JSON", async () => {
      const fileDataArray = [
        {
          filePath: "/test/climbers.json",
          rawData: "invalid json",
          index: 0,
        },
      ];
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "Unexpected token"
      );
    });

    test("should throw ProcessingError when data is not an array", async () => {
      const fileDataArray = [
        {
          filePath: "/test/climbers.json",
          rawData: '{"not": "array"}',
          index: 0,
        },
      ];
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "Climbers data in /test/climbers.json must be an array"
      );
    });

    test("should throw ProcessingError for non-string climber names", async () => {
      const testData = ["Alice", 123, "Bob"];
      const fileDataArray = [
        {
          filePath: "/test/climbers.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "Climber name at index 1 in /test/climbers.json must be a string"
      );
    });
  });

  describe("validate", () => {
    test("should validate correct climbers data", async () => {
      const testData = {
        climbers: [
          { firstName: "Alice", lastName: "Smith" },
          { firstName: "Bob", lastName: "Jones" },
          { firstName: "Charlie", lastName: "Brown" },
        ],
        metadata: {
          totalProcessed: 3,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result).toHaveProperty("climbers");
      expect(result).toHaveProperty("metadata");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
        { firstName: "Charlie", lastName: "Brown" },
      ]);
      expect(result.climbers).toHaveLength(3);
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
    });

    test("should detect duplicate names", async () => {
      const testData = {
        climbers: [
          { firstName: "Alice", lastName: "Smith" },
          { firstName: "alice", lastName: "smith" }, // Case insensitive duplicate
          { firstName: "Bob", lastName: "Jones" },
        ],
        metadata: {
          totalProcessed: 3,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result.climbers).toHaveLength(3); // Still returns all names
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 warnings"),
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.objectContaining({
              type: "duplicate_name",
              message: expect.stringContaining(
                'Duplicate climber name found: "alice smith"'
              ),
            }),
          ]),
        })
      );
    });

    test("should handle validation errors for invalid climbers", async () => {
      const testData = {
        climbers: [
          { firstName: "Alice", lastName: "Smith" },
          { firstName: "", lastName: "" }, // Empty name
          { firstName: "Bob", lastName: "Jones" },
        ],
        metadata: {
          totalProcessed: 3,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result.climbers).toHaveLength(2); // Only valid climbers
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 errors"),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError for invalid data structure", async () => {
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        "Invalid data structure: climbers must be an array"
      );
    });

    test("should throw ProcessingError for null/undefined data", async () => {
      const source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.validate(null)).rejects.toThrow(ProcessingError);
      await expect(source.validate(undefined)).rejects.toThrow(ProcessingError);
    });
  });

  describe("validateSingleClimber", () => {
    let source;

    beforeEach(() => {
      source = new ClimbersSource({ inputFile: fixtureFile }, mockLogger);
    });

    test("should validate correct climber object", async () => {
      const climber = { firstName: "Alice", lastName: "Smith" };
      const result = await source.validateSingleClimber(climber, 0);
      expect(result).toEqual({ firstName: "Alice", lastName: "Smith" });
    });

    test("should trim whitespace from names", async () => {
      const climber = { firstName: "  Alice  ", lastName: "  Smith  " };
      const result = await source.validateSingleClimber(climber, 0);
      expect(result).toEqual({ firstName: "Alice", lastName: "Smith" });
    });

    test("should throw error for non-object climber", async () => {
      await expect(source.validateSingleClimber(123, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleClimber(null, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleClimber("string", 0)).rejects.toThrow(
        ProcessingError
      );
    });

    test("should throw error for missing firstName", async () => {
      const climber = { lastName: "Smith" };
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        "must have a firstName string"
      );
    });

    test("should throw error for missing lastName", async () => {
      const climber = { firstName: "Alice" };
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        "must have a lastName string"
      );
    });

    test("should throw error for empty name", async () => {
      const climber = { firstName: "", lastName: "" };
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleClimber(climber, 0)).rejects.toThrow(
        "cannot have an empty name"
      );
    });
  });

  describe("process", () => {
    test("should process climbers data end-to-end", async () => {
      const testData = ["Alice Smith", "Bob Jones", "Charlie Brown"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.process();

      expect(result).toHaveProperty("climbers");
      expect(result).toHaveProperty("metadata");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
        { firstName: "Charlie", lastName: "Brown" },
      ]);
      expect(result.climbers).toHaveLength(3);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[ClimbersSource] process: Starting data processing"
        ),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[ClimbersSource] process: Data processing completed"
        ),
        expect.any(Object)
      );
    });

    test("should handle processing with validation warnings", async () => {
      const testData = ["Alice Smith", "alice smith", "Bob Jones"]; // Duplicate names
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.process();

      expect(result).toHaveProperty("climbers");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "alice", lastName: "smith" },
        { firstName: "Bob", lastName: "Jones" },
      ]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 warnings"),
        expect.any(Object)
      );
    });

    test("should handle processing with validation errors", async () => {
      const testData = ["Alice Smith", "", "Bob Jones"]; // Empty name
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.process();

      expect(result).toHaveProperty("climbers");
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
      ]); // Only valid names
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 errors"),
        expect.any(Object)
      );
    });
  });

  describe("caching functionality", () => {
    test("should process and cache data when cache is enabled", async () => {
      const testData = ["Alice Smith", "Bob Jones"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      const result = await source.process();

      expect(result).toHaveProperty("climbers");
      expect(result.climbers).toHaveLength(2);
      expect(result.climbers).toEqual([
        { firstName: "Alice", lastName: "Smith" },
        { firstName: "Bob", lastName: "Jones" },
      ]);

      // Verify data was cached
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toMatchObject({
        climbers: result.climbers,
        metadata: {
          totalProcessed: result.metadata.totalProcessed,
          sourceFiles: result.metadata.sourceFiles,
          validationResults: result.metadata.validationResults,
        },
      });
    });

    test("should use cached data when available and up to date", async () => {
      const testData = ["Alice Smith", "Bob Jones"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      // First call should process and cache
      const result1 = await source.process();

      // Second call should use cache
      const result2 = await source.process();

      expect(result2).toMatchObject({
        climbers: result1.climbers,
        metadata: {
          totalProcessed: result1.metadata.totalProcessed,
          sourceFiles: result1.metadata.sourceFiles,
          validationResults: result1.metadata.validationResults,
        },
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Using cached data for ClimbersSource"
      );
    });

    test("should reprocess when source file is newer than cache", async () => {
      const testData1 = ["Alice Smith"];
      await fs.writeFile(testInputFile, JSON.stringify(testData1));

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      // First call
      const result1 = await source.process();
      expect(result1.climbers).toHaveLength(1);

      // Wait and update source file
      await new Promise((resolve) => setTimeout(resolve, 100));
      const testData2 = ["Alice Smith", "Bob Jones"];
      await fs.writeFile(testInputFile, JSON.stringify(testData2));

      // Second call should reprocess
      const result2 = await source.process();
      expect(result2.climbers).toHaveLength(2);
      // The cache system will log that cache doesn't exist or source is newer
      // We just need to verify that fresh processing occurred
      expect(result2.climbers).toHaveLength(2);
    });

    test("should skip caching when cache is disabled", async () => {
      const testData = ["Alice Smith", "Bob Jones"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: false },
        },
        mockLogger,
        cache
      );

      const result = await source.process();

      expect(result.climbers).toHaveLength(2);

      // Verify data was not cached
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toBeNull();
    });

    test("should handle cache errors gracefully", async () => {
      const testData = ["Alice Smith", "Bob Jones"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      // Mock cache that throws on set
      const errorCache = {
        isSourceNewer: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockRejectedValue(new Error("Cache write failed")),
      };

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        errorCache
      );

      // Should not throw, just warn
      const result = await source.process();

      expect(result.climbers).toHaveLength(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to cache data:",
        "Cache write failed"
      );
    });
  });

  describe("cache key generation", () => {
    test("should generate consistent cache keys for same config", () => {
      const config = { inputFile: "/test/file.json", cache: { enabled: true } };
      const source1 = new ClimbersSource(config, mockLogger, cache);
      const source2 = new ClimbersSource(config, mockLogger, cache);

      expect(source1.getCacheKey()).toBe(source2.getCacheKey());
    });

    test("should generate different cache keys for different configs", () => {
      const config1 = { inputFile: "/test/file1.json" };
      const config2 = { inputFile: "/test/file2.json" };

      const source1 = new ClimbersSource(config1, mockLogger, cache);
      const source2 = new ClimbersSource(config2, mockLogger, cache);

      expect(source1.getCacheKey()).not.toBe(source2.getCacheKey());
    });

    test("should include cache enabled setting in key", () => {
      const config1 = {
        inputFile: "/test/file.json",
        cache: { enabled: true },
      };
      const config2 = {
        inputFile: "/test/file.json",
        cache: { enabled: false },
      };

      const source1 = new ClimbersSource(config1, mockLogger, cache);
      const source2 = new ClimbersSource(config2, mockLogger, cache);

      expect(source1.getCacheKey()).not.toBe(source2.getCacheKey());
    });
  });

  describe("clearCache", () => {
    test("should clear cache for this source", async () => {
      const testData = ["Alice", "Bob"];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new ClimbersSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      // Process to create cache
      await source.process();

      const cacheKey = source.getCacheKey();
      expect(await cache.exists(cacheKey)).toBe(true);

      // Clear cache
      await source.clearCache();

      expect(await cache.exists(cacheKey)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Cleared cache for ClimbersSource")
      );
    });

    test("should handle missing cache gracefully", async () => {
      const source = new ClimbersSource(
        { inputFile: fixtureFile },
        mockLogger,
        null
      );

      await expect(source.clearCache()).resolves.not.toThrow();
    });
  });

  describe("getSourceFiles", () => {
    test("should return input file path", () => {
      const inputFile = "/test/climbers.json";
      const source = new ClimbersSource({ inputFile }, mockLogger, cache);

      const sourceFiles = source.getSourceFiles();

      expect(sourceFiles).toEqual([inputFile]);
    });
  });

  describe("integration test with mock data", () => {
    test("should process mock climbers data", async () => {
      // Use mock data instead of real data
      const mockData = [
        "John Doe",
        "Jane Smith",
        "Mike Johnson",
        "Sarah Wilson",
        "David Brown",
        "Lisa Davis",
        "Tom Miller",
        "Emma Garcia",
        "Chris Martinez",
        "Anna Rodriguez",
      ];

      await fs.writeFile(testInputFile, JSON.stringify(mockData));

      const source = new ClimbersSource(
        { inputFile: testInputFile },
        mockLogger,
        cache
      );
      const result = await source.process();

      expect(result).toHaveProperty("climbers");
      expect(result).toHaveProperty("metadata");
      expect(result.climbers).toHaveLength(10);
      expect(result.climbers).toEqual([
        { firstName: "John", lastName: "Doe" },
        { firstName: "Jane", lastName: "Smith" },
        { firstName: "Mike", lastName: "Johnson" },
        { firstName: "Sarah", lastName: "Wilson" },
        { firstName: "David", lastName: "Brown" },
        { firstName: "Lisa", lastName: "Davis" },
        { firstName: "Tom", lastName: "Miller" },
        { firstName: "Emma", lastName: "Garcia" },
        { firstName: "Chris", lastName: "Martinez" },
        { firstName: "Anna", lastName: "Rodriguez" },
      ]);

      // Check specific climbers
      expect(result.climbers).toContainEqual({
        firstName: "John",
        lastName: "Doe",
      });
      expect(result.climbers).toContainEqual({
        firstName: "Jane",
        lastName: "Smith",
      });
      expect(result.climbers).toContainEqual({
        firstName: "Anna",
        lastName: "Rodriguez",
      });
    });
  });
});
