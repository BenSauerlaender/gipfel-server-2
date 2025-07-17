const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const RoutesSource = require("../../lib/sources/routes-source");
const SimpleCache = require("../../lib/core/simple-cache");
const ProcessingError = require("../../lib/core/error");

describe("RoutesSource", () => {
  let tempDir;
  let mockLogger;
  let cache;
  let testInputFile;
  let fixtureFile;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "routes-source-test-"));

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
    testInputFile = path.join(tempDir, "test-routes.json");

    // Use test fixture file
    fixtureFile = path.join(__dirname, "../fixtures/sample-routes.json");
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
        new RoutesSource({}, mockLogger, cache);
      }).toThrow(ProcessingError);
      expect(() => {
        new RoutesSource({}, mockLogger, cache);
      }).toThrow(
        "RoutesSource requires either inputFile or inputFiles to be configured"
      );
    });

    test("should use provided single file configuration", () => {
      const config = {
        inputFile: "/custom/path/routes.json",
        cache: { enabled: false },
      };
      const source = new RoutesSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual(["/custom/path/routes.json"]);
      expect(source.cacheEnabled).toBe(false);
    });

    test("should use provided multiple files configuration", () => {
      const config = {
        inputFiles: ["/path/file1.json", "/path/file2.json"],
        cache: { enabled: true },
      };
      const source = new RoutesSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual([
        "/path/file1.json",
        "/path/file2.json",
      ]);
      expect(source.cacheEnabled).toBe(true);
    });
  });

  describe("fetch", () => {
    test("should successfully read valid JSON file", async () => {
      const testData = [
        {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource({ inputFile: testInputFile }, mockLogger);
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
          "[RoutesSource] fetch: Reading routes data from 1 files"
        ),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[RoutesSource] fetch: Successfully read"),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError when file does not exist", async () => {
      const source = new RoutesSource(
        { inputFile: "/non/existent/file.json" },
        mockLogger
      );

      await expect(source.fetch()).rejects.toThrow(ProcessingError);
      await expect(source.fetch()).rejects.toThrow(
        "ENOENT: no such file or directory, open '/non/existent/file.json'"
      );
    });

    test("should throw ProcessingError with correct category", async () => {
      const source = new RoutesSource(
        { inputFile: "/non/existent/file.json" },
        mockLogger
      );

      try {
        await source.fetch();
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessingError);
        expect(error.category).toBe(ProcessingError.Categories.SOURCE_ERROR);
        expect(error.source).toBe("RoutesSource");
      }
    });
  });

  describe("parse", () => {
    test("should parse valid routes array into object with metadata", async () => {
      const testData = [
        {
          name: "Test Route 1",
          summit: "Test Summit 1",
          difficulty: { normal: "V" },
        },
        {
          name: "Test Route 2",
          summit: "Test Summit 2",
          difficulty: { RP: "VII" },
        },
      ];
      const fileDataArray = [
        {
          filePath: "/test/routes.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.routes).toEqual(testData);
      expect(result.routes).toHaveLength(2);
      expect(result.metadata).toHaveProperty("totalProcessed", 2);
      expect(result.metadata).toHaveProperty("processedAt");
      expect(result.metadata).toHaveProperty("sourceFiles", [
        "/test/routes.json",
      ]);
    });

    test("should throw ProcessingError for invalid JSON", async () => {
      const fileDataArray = [
        {
          filePath: "/test/routes.json",
          rawData: "invalid json",
          index: 0,
        },
      ];
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

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
          filePath: "/test/routes.json",
          rawData: '{"not": "array"}',
          index: 0,
        },
      ];
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "Routes data in /test/routes.json must be an array"
      );
    });
  });

  describe("validate", () => {
    test("should validate correct routes data", async () => {
      const testData = {
        routes: [
          {
            name: "Test Route 1",
            summit: "Test Summit 1",
            difficulty: { normal: "V" },
            stars: 1,
          },
          {
            name: "Test Route 2",
            summit: "Test Summit 2",
            difficulty: { RP: "VII" },
            teufelsturmId: "123",
            teufelsturmScore: "2",
          },
        ],
        metadata: {
          totalProcessed: 2,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.routes).toHaveLength(2);
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
    });

    test("should detect duplicate routes", async () => {
      const testData = {
        routes: [
          {
            name: "Test Route",
            summit: "Test Summit",
            difficulty: { normal: "V" },
          },
          {
            name: "TEST ROUTE", // Case insensitive duplicate
            summit: "test summit",
            difficulty: { RP: "VII" },
          },
          {
            name: "Different Route",
            summit: "Test Summit",
            difficulty: { normal: "III" },
          },
        ],
        metadata: {
          totalProcessed: 3,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result.routes).toHaveLength(3); // Still returns all routes
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 warnings"),
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.objectContaining({
              type: "duplicate_route",
              message: expect.stringContaining(
                'Duplicate route found: "TEST ROUTE" on "test summit"'
              ),
            }),
          ]),
        })
      );
    });

    test("should handle validation errors for invalid routes", async () => {
      const testData = {
        routes: [
          {
            name: "Valid Route",
            summit: "Valid Summit",
            difficulty: { normal: "V" },
          },
          {
            name: "", // Empty name
            summit: "Test Summit",
            difficulty: { normal: "III" },
          },
          {
            name: "No Difficulty Route",
            summit: "Test Summit",
            // Missing difficulty
          },
        ],
        metadata: {
          totalProcessed: 3,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result.routes).toHaveLength(1); // Only valid routes
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 2 errors"),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError for invalid data structure", async () => {
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        "Invalid data structure: routes must be an array"
      );
    });

    test("should throw ProcessingError for null/undefined data", async () => {
      const source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.validate(null)).rejects.toThrow(ProcessingError);
      await expect(source.validate(undefined)).rejects.toThrow(ProcessingError);
    });
  });

  describe("validateSingleRoute", () => {
    let source;

    beforeEach(() => {
      source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);
    });

    test("should validate correct route object with minimal fields", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      });
    });

    test("should validate route with all optional fields", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V", RP: "VII" },
        teufelsturmId: "123",
        teufelsturmScore: "2",
        unsecure: true,
        stars: 1,
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V", RP: "VII" },
        teufelsturmId: "123",
        teufelsturmScore: "2",
        unsecure: true,
        stars: 1,
      });
    });

    test("should filter out empty/null/undefined properties", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: {
          normal: "V",
          RP: "",
          jump: null,
          withoutSupport: undefined,
        },
        teufelsturmId: "",
        teufelsturmScore: null,
        unsecure: undefined,
        stars: null,
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" }, // Only non-empty difficulty
      });
      // Verify empty properties are not present
      expect(result).not.toHaveProperty("teufelsturmId");
      expect(result).not.toHaveProperty("teufelsturmScore");
      expect(result).not.toHaveProperty("unsecure");
      expect(result).not.toHaveProperty("stars");
      expect(result.difficulty).not.toHaveProperty("RP");
      expect(result.difficulty).not.toHaveProperty("jump");
      expect(result.difficulty).not.toHaveProperty("withoutSupport");
    });

    test("should filter out whitespace-only difficulty values", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V", RP: "  ", jump: "\t\n" },
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      });
      expect(result.difficulty).not.toHaveProperty("RP");
      expect(result.difficulty).not.toHaveProperty("jump");
    });

    test("should trim whitespace from name and summit", async () => {
      const route = {
        name: "  Test Route  ",
        summit: "  Test Summit  ",
        difficulty: { normal: "  V  " },
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      });
    });

    test("should validate different difficulty types", async () => {
      const difficulties = [
        { jump: "VI" },
        { RP: "VII" },
        { normal: "V" },
        { withoutSupport: "VIII" },
        { normal: "V", RP: "VII" }, // Multiple difficulties
      ];

      for (let i = 0; i < difficulties.length; i++) {
        const route = {
          name: `Route ${i}`,
          summit: "Test Summit",
          difficulty: difficulties[i],
        };
        const result = await source.validateSingleRoute(route, i);
        expect(result.difficulty).toEqual(difficulties[i]);
      }
    });

    test("should validate stars values", async () => {
      const validStars = [0, 1, 2];

      for (const stars of validStars) {
        const route = {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
          stars: stars,
        };
        const result = await source.validateSingleRoute(route, 0);
        expect(result.stars).toBe(stars);
      }
    });

    test("should validate teufelsturmScore values", async () => {
      const validScores = ["-3", "-2", "-1", "0", "1", "2", "3"];

      for (const score of validScores) {
        const route = {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
          teufelsturmScore: score,
        };
        const result = await source.validateSingleRoute(route, 0);
        expect(result.teufelsturmScore).toBe(score);
      }
    });

    test("should filter out empty teufelsturmScore", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
        teufelsturmScore: "",
      };
      const result = await source.validateSingleRoute(route, 0);
      expect(result).toEqual({
        name: "Test Route",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      });
      expect(result).not.toHaveProperty("teufelsturmScore");
    });

    test("should throw error for non-object route", async () => {
      await expect(source.validateSingleRoute(123, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(null, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute("string", 0)).rejects.toThrow(
        ProcessingError
      );
    });

    test("should throw error for missing name", async () => {
      const route = {
        summit: "Test Summit",
        difficulty: { normal: "V" },
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have a non-empty name string"
      );
    });

    test("should throw error for empty name", async () => {
      const route = {
        name: "",
        summit: "Test Summit",
        difficulty: { normal: "V" },
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have a non-empty name string"
      );
    });

    test("should throw error for missing summit", async () => {
      const route = {
        name: "Test Route",
        difficulty: { normal: "V" },
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have a non-empty summit string"
      );
    });

    test("should throw error for empty summit", async () => {
      const route = {
        name: "Test Route",
        summit: "",
        difficulty: { normal: "V" },
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have a non-empty summit string"
      );
    });

    test("should throw error for missing difficulty", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have a difficulty object"
      );
    });

    test("should throw error for empty difficulty object", async () => {
      const route = {
        name: "Test Route",
        summit: "Test Summit",
        difficulty: {},
      };
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
        "must have at least one difficulty type"
      );
    });

    test("should throw error for invalid stars value", async () => {
      const invalidStars = [-1, 3, 1.5, "invalid"];

      for (const stars of invalidStars) {
        const route = {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
          stars: stars,
        };
        await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
          ProcessingError
        );
        await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
          "has invalid stars value"
        );
      }
    });

    test("should throw error for invalid teufelsturmScore", async () => {
      const invalidScores = ["-4", "4", "invalid", "1.5"];

      for (const score of invalidScores) {
        const route = {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
          teufelsturmScore: score,
        };
        await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
          ProcessingError
        );
        await expect(source.validateSingleRoute(route, 0)).rejects.toThrow(
          "has invalid teufelsturmScore"
        );
      }
    });
  });

  describe("isValidTeufelsturmScore", () => {
    let source;

    beforeEach(() => {
      source = new RoutesSource({ inputFile: fixtureFile }, mockLogger);
    });

    test("should validate correct score range", () => {
      const validScores = ["-3", "-2", "-1", "0", "1", "2", "3"];
      validScores.forEach((score) => {
        expect(source.isValidTeufelsturmScore(score)).toBe(true);
      });
    });

    test("should reject invalid scores", () => {
      const invalidScores = ["-4", "4", "invalid", "1.5"];
      invalidScores.forEach((score) => {
        expect(source.isValidTeufelsturmScore(score)).toBe(false);
      });
    });

    test("should accept empty string as valid score", () => {
      expect(source.isValidTeufelsturmScore("")).toBe(true);
    });
  });

  describe("process", () => {
    test("should process routes data end-to-end", async () => {
      const testData = [
        {
          name: "Test Route 1",
          summit: "Test Summit 1",
          difficulty: { normal: "V" },
          stars: 1,
        },
        {
          name: "Test Route 2",
          summit: "Test Summit 2",
          difficulty: { RP: "VII" },
          teufelsturmId: "123",
          teufelsturmScore: "2",
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource({ inputFile: testInputFile }, mockLogger);
      const result = await source.process();

      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.routes).toHaveLength(2);
      expect(result.routes[0]).toMatchObject({
        name: "Test Route 1",
        summit: "Test Summit 1",
        difficulty: { normal: "V" },
        stars: 1,
      });
      expect(result.routes[1]).toMatchObject({
        name: "Test Route 2",
        summit: "Test Summit 2",
        difficulty: { RP: "VII" },
        teufelsturmId: "123",
        teufelsturmScore: "2",
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[RoutesSource] process: Starting data processing"
        ),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[RoutesSource] process: Data processing completed"
        ),
        expect.any(Object)
      );
    });

    test("should handle processing with validation warnings", async () => {
      const testData = [
        {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
        },
        {
          name: "test route", // Duplicate name (case insensitive)
          summit: "test summit",
          difficulty: { RP: "VII" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource({ inputFile: testInputFile }, mockLogger);
      const result = await source.process();

      expect(result).toHaveProperty("routes");
      expect(result.routes).toHaveLength(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 warnings"),
        expect.any(Object)
      );
    });

    test("should handle processing with validation errors", async () => {
      const testData = [
        {
          name: "Valid Route",
          summit: "Valid Summit",
          difficulty: { normal: "V" },
        },
        {
          name: "", // Invalid empty name
          summit: "Test Summit",
          difficulty: { normal: "III" },
        },
        {
          name: "Another Valid Route",
          summit: "Another Summit",
          difficulty: { RP: "VII" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource({ inputFile: testInputFile }, mockLogger);
      const result = await source.process();

      expect(result).toHaveProperty("routes");
      expect(result.routes).toHaveLength(2); // Only valid routes
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 errors"),
        expect.any(Object)
      );
    });
  });

  describe("caching functionality", () => {
    test("should process and cache data when cache is enabled", async () => {
      const testData = [
        {
          name: "Test Route 1",
          summit: "Test Summit 1",
          difficulty: { normal: "V" },
        },
        {
          name: "Test Route 2",
          summit: "Test Summit 2",
          difficulty: { RP: "VII" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      const result = await source.process();

      expect(result).toHaveProperty("routes");
      expect(result.routes).toHaveLength(2);

      // Verify data was cached
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toMatchObject({
        routes: result.routes,
        metadata: {
          totalProcessed: result.metadata.totalProcessed,
          sourceFiles: result.metadata.sourceFiles,
          validationResults: result.metadata.validationResults,
        },
      });
    });

    test("should use cached data when available and up to date", async () => {
      const testData = [
        {
          name: "Test Route 1",
          summit: "Test Summit 1",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource(
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
        routes: result1.routes,
        metadata: {
          totalProcessed: result1.metadata.totalProcessed,
          sourceFiles: result1.metadata.sourceFiles,
          validationResults: result1.metadata.validationResults,
        },
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Using cached data for RoutesSource"
      );
    });

    test("should reprocess when source file is newer than cache", async () => {
      const testData1 = [
        {
          name: "Test Route 1",
          summit: "Test Summit 1",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData1));

      const source = new RoutesSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      // First call
      const result1 = await source.process();
      expect(result1.routes).toHaveLength(1);

      // Wait and update source file
      await new Promise((resolve) => setTimeout(resolve, 100));
      const testData2 = [
        ...testData1,
        {
          name: "Test Route 2",
          summit: "Test Summit 2",
          difficulty: { RP: "VII" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData2));

      // Second call should reprocess
      const result2 = await source.process();
      expect(result2.routes).toHaveLength(2);
      // The cache system will log that cache doesn't exist or source is newer
      // We just need to verify that fresh processing occurred
      expect(result2.routes).toHaveLength(2);
    });

    test("should skip caching when cache is disabled", async () => {
      const testData = [
        {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource(
        {
          inputFile: testInputFile,
          cache: { enabled: false },
        },
        mockLogger,
        cache
      );

      const result = await source.process();

      expect(result.routes).toHaveLength(1);

      // Verify data was not cached
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toBeNull();
    });

    test("should handle cache errors gracefully", async () => {
      const testData = [
        {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      // Mock cache that throws on set
      const errorCache = {
        isSourceNewer: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockRejectedValue(new Error("Cache write failed")),
      };

      const source = new RoutesSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        errorCache
      );

      // Should not throw, just warn
      const result = await source.process();

      expect(result.routes).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to cache data:",
        "Cache write failed"
      );
    });
  });

  describe("cache key generation", () => {
    test("should generate consistent cache keys for same config", () => {
      const config = { inputFile: "/test/file.json", cache: { enabled: true } };
      const source1 = new RoutesSource(config, mockLogger, cache);
      const source2 = new RoutesSource(config, mockLogger, cache);

      expect(source1.getCacheKey()).toBe(source2.getCacheKey());
    });

    test("should generate different cache keys for different configs", () => {
      const config1 = { inputFile: "/test/file1.json" };
      const config2 = { inputFile: "/test/file2.json" };

      const source1 = new RoutesSource(config1, mockLogger, cache);
      const source2 = new RoutesSource(config2, mockLogger, cache);

      expect(source1.getCacheKey()).not.toBe(source2.getCacheKey());
    });
  });

  describe("clearCache", () => {
    test("should clear cache for this source", async () => {
      const testData = [
        {
          name: "Test Route",
          summit: "Test Summit",
          difficulty: { normal: "V" },
        },
      ];
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new RoutesSource(
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
        expect.stringContaining("Cleared cache for RoutesSource")
      );
    });

    test("should handle missing cache gracefully", async () => {
      const source = new RoutesSource(
        { inputFile: fixtureFile },
        mockLogger,
        null
      );

      await expect(source.clearCache()).resolves.not.toThrow();
    });
  });

  describe("getSourceFiles", () => {
    test("should return input file path", () => {
      const inputFile = "/test/routes.json";
      const source = new RoutesSource({ inputFile }, mockLogger, cache);

      const sourceFiles = source.getSourceFiles();

      expect(sourceFiles).toEqual([inputFile]);
    });
  });

  describe("integration test with real data structure", () => {
    test("should process routes data matching the provided structure", async () => {
      // Use data structure matching the real routes.json format
      const mockData = [
        {
          name: "Perrykante",
          summit: "Tante",
          teufelsturmId: "",
          teufelsturmScore: "",
          stars: 1,
          difficulty: {
            normal: "V",
          },
        },
        {
          name: "Variante zum AW",
          summit: "Großer Mühlenwächter",
          teufelsturmId: "",
          teufelsturmScore: "",
          stars: 1,
          difficulty: {
            normal: "II",
          },
        },
        {
          name: "Kleine Kante",
          summit: "Hinterer Schroffer Stein",
          teufelsturmId: "",
          teufelsturmScore: "",
          stars: 0,
          difficulty: {
            normal: "V",
          },
        },
        {
          name: "Advanced Route",
          summit: "Test Summit",
          teufelsturmId: "123",
          teufelsturmScore: "2",
          unsecure: true,
          stars: 2,
          difficulty: {
            normal: "VI",
            RP: "VII",
            jump: "VIII",
          },
        },
      ];

      await fs.writeFile(testInputFile, JSON.stringify(mockData));

      const source = new RoutesSource(
        { inputFile: testInputFile },
        mockLogger,
        cache
      );
      const result = await source.process();

      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.routes).toHaveLength(4);

      // Check specific routes - empty strings are now filtered out
      expect(result.routes).toContainEqual({
        name: "Perrykante",
        summit: "Tante",
        stars: 1,
        difficulty: {
          normal: "V",
        },
      });

      expect(result.routes).toContainEqual({
        name: "Advanced Route",
        summit: "Test Summit",
        teufelsturmId: "123",
        teufelsturmScore: "2",
        unsecure: true,
        stars: 2,
        difficulty: {
          normal: "VI",
          RP: "VII",
          jump: "VIII",
        },
      });

      // Verify all routes have required fields
      result.routes.forEach((route, index) => {
        expect(route).toHaveProperty("name");
        expect(route).toHaveProperty("summit");
        expect(route).toHaveProperty("difficulty");
        expect(typeof route.name).toBe("string");
        expect(typeof route.summit).toBe("string");
        expect(typeof route.difficulty).toBe("object");
        expect(route.name.length).toBeGreaterThan(0);
        expect(route.summit.length).toBeGreaterThan(0);
        expect(Object.keys(route.difficulty).length).toBeGreaterThan(0);
      });
    });
  });
});
