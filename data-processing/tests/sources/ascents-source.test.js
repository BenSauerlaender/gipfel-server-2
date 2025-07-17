const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const AscentsSource = require("../../lib/sources/ascents-source");
const SimpleCache = require("../../lib/core/simple-cache");
const ProcessingError = require("../../lib/core/error");

describe("AscentsSource", () => {
  let tempDir;
  let mockLogger;
  let cache;
  let testInputFile;
  let fixtureFile;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ascents-source-test-"));

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
    testInputFile = path.join(tempDir, "test-ascents.json");

    // Use test fixture file
    fixtureFile = path.join(__dirname, "../fixtures/sample-ascents.json");
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
        new AscentsSource({}, mockLogger, cache);
      }).toThrow(ProcessingError);
      expect(() => {
        new AscentsSource({}, mockLogger, cache);
      }).toThrow(
        "AscentsSource requires either inputFile or inputFiles to be configured"
      );
    });

    test("should use provided single file configuration", () => {
      const config = {
        inputFile: "/custom/path/ascents.json",
        cache: { enabled: false },
      };
      const source = new AscentsSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual(["/custom/path/ascents.json"]);
      expect(source.cacheEnabled).toBe(false);
    });

    test("should use provided multiple files configuration", () => {
      const config = {
        inputFiles: ["/path/file1.json", "/path/file2.json"],
        cache: { enabled: true },
      };
      const source = new AscentsSource(config, mockLogger, cache);

      expect(source.inputFiles).toEqual([
        "/path/file1.json",
        "/path/file2.json",
      ]);
      expect(source.cacheEnabled).toBe(true);
    });
  });

  describe("fetch", () => {
    test("should successfully read valid JSON file", async () => {
      const testData = {
        climberAbbrMap: { Kay: "Kay Sauerländer" },
        ascents: [],
      };
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new AscentsSource(
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
          "[AscentsSource] fetch: Reading ascents data from 1 files"
        ),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError when file does not exist", async () => {
      const source = new AscentsSource(
        { inputFile: "/non/existent/file.json" },
        mockLogger
      );

      await expect(source.fetch()).rejects.toThrow(ProcessingError);
      await expect(source.fetch()).rejects.toThrow(
        "ENOENT: no such file or directory, open '/non/existent/file.json'"
      );
    });
  });

  describe("parse", () => {
    test("should parse valid ascents data with climber mapping", async () => {
      const testData = {
        climberAbbrMap: {
          Kay: "Kay Sauerländer",
          Ben: "Ben Sauerländer",
        },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route",
            climbers: ["Kay", "Ben"],
            leadClimber: "Kay",
          },
        ],
      };
      const fileDataArray = [
        {
          filePath: "/test/ascents.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      expect(result).toHaveProperty("ascents");
      expect(result).toHaveProperty("metadata");
      expect(result.ascents).toHaveLength(1);
      expect(result.ascents[0]).toMatchObject({
        route: "Test Route",
        leadClimber: "Kay Sauerländer",
        climbers: [
          { climber: "Kay Sauerländer", isAborted: false },
          { climber: "Ben Sauerländer", isAborted: false },
        ],
      });
      expect(result.ascents[0].date).toBeInstanceOf(Date);
    });

    test("should handle aborted climbers in parentheses", async () => {
      const testData = {
        climberAbbrMap: {
          Kay: "Kay Sauerländer",
          Ben: "Ben Sauerländer",
        },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route",
            climbers: ["Kay", "(Ben)"],
            leadClimber: "Kay",
          },
        ],
      };
      const fileDataArray = [
        {
          filePath: "/test/ascents.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      expect(result.ascents[0].climbers).toEqual([
        { climber: "Kay Sauerländer", isAborted: false },
        { climber: "Ben Sauerländer", isAborted: true },
      ]);
    });

    test("should apply consecutive milliseconds for same-day ascents", async () => {
      const testData = {
        climberAbbrMap: { Kay: "Kay Sauerländer" },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Route 1",
            climbers: ["Kay"],
          },
          {
            date: "2023-05-01",
            number: 2,
            route: "Route 2",
            climbers: ["Kay"],
          },
        ],
      };
      const fileDataArray = [
        {
          filePath: "/test/ascents.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.parse(fileDataArray);

      const baseDate = new Date("2023-05-01");
      baseDate.setHours(0, 0, 0, 0);

      expect(result.ascents[0].date.getTime()).toBe(baseDate.getTime() + 1);
      expect(result.ascents[1].date.getTime()).toBe(baseDate.getTime() + 2);
    });

    test("should throw error for missing climberAbbrMap", async () => {
      const testData = { ascents: [] };
      const fileDataArray = [
        {
          filePath: "/test/ascents.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "must contain climberAbbrMap object"
      );
    });

    test("should throw error for unknown climber abbreviation", async () => {
      const testData = {
        climberAbbrMap: { Kay: "Kay Sauerländer" },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route",
            climbers: ["Unknown"],
          },
        ],
      };
      const fileDataArray = [
        {
          filePath: "/test/ascents.json",
          rawData: JSON.stringify(testData),
          index: 0,
        },
      ];
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.parse(fileDataArray)).rejects.toThrow(
        ProcessingError
      );
      await expect(source.parse(fileDataArray)).rejects.toThrow(
        "Unknown climber abbreviation: Unknown"
      );
    });
  });
  describe("parseAscent", () => {
    let source;
    const climberAbbrMap = {
      Kay: "Kay Sauerländer",
      Ben: "Ben Sauerländer",
    };

    beforeEach(() => {
      source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);
    });

    test("should parse basic ascent with required fields", async () => {
      const ascent = {
        date: "2023-05-01",
        number: 1,
        route: "Test Route",
        climbers: ["Kay", "Ben"],
      };

      const result = await source.parseAscent(ascent, 0, climberAbbrMap);

      expect(result).toMatchObject({
        route: "Test Route",
        climbers: [
          { climber: "Kay Sauerländer", isAborted: false },
          { climber: "Ben Sauerländer", isAborted: false },
        ],
      });
      expect(result.date).toBeInstanceOf(Date);
    });

    test("should parse ascent with all optional fields", async () => {
      const ascent = {
        date: "2023-05-01",
        number: 1,
        route: "Test Route",
        climbers: ["Kay"],
        leadClimber: "Kay",
        isAborted: true,
        isTopRope: true,
        isSolo: false,
        isWithoutSupport: false,
        notes: "Test notes",
      };

      const result = await source.parseAscent(ascent, 0, climberAbbrMap);

      expect(result).toMatchObject({
        route: "Test Route",
        leadClimber: "Kay Sauerländer",
        isAborted: true,
        isTopRope: true,
        isSolo: false,
        isWithoutSupport: false,
        notes: "Test notes",
      });
    });

    test("should filter out empty/null/undefined optional fields", async () => {
      const ascent = {
        date: "2023-05-01",
        number: 1,
        route: "Test Route",
        climbers: ["Kay"],
        leadClimber: "",
        notes: null,
        isAborted: undefined,
      };

      const result = await source.parseAscent(ascent, 0, climberAbbrMap);

      expect(result).toEqual({
        date: expect.any(Date),
        route: "Test Route",
        climbers: [{ climber: "Kay Sauerländer", isAborted: false }],
      });
      expect(result).not.toHaveProperty("leadClimber");
      expect(result).not.toHaveProperty("notes");
      expect(result).not.toHaveProperty("isAborted");
    });

    test("should throw error for missing required fields", async () => {
      const invalidAscents = [
        { number: 1, route: "Test", climbers: ["Kay"] }, // Missing date
        { date: "2023-05-01", number: 1, climbers: ["Kay"] }, // Missing route
        { date: "2023-05-01", number: 1, route: "Test" }, // Missing climbers
        { date: "2023-05-01", number: 1, route: "Test", climbers: [] }, // Empty climbers
      ];

      for (const ascent of invalidAscents) {
        await expect(
          source.parseAscent(ascent, 0, climberAbbrMap)
        ).rejects.toThrow(ProcessingError);
      }
    });

    test("should auto-generate number field when missing", async () => {
      const ascent = {
        date: "2023-05-01",
        route: "Test Route",
        climbers: ["Kay"],
      };

      const result = await source.parseAscent(ascent, 0, climberAbbrMap);

      expect(result).toMatchObject({
        route: "Test Route",
        climbers: [{ climber: "Kay Sauerländer", isAborted: false }],
      });
      expect(result.date).toBeInstanceOf(Date);
      // Should have auto-generated number (1) added as milliseconds
      expect(result.date.getMilliseconds()).toBe(1);
    });

    test("should throw error for invalid date format", async () => {
      const ascent = {
        date: "invalid-date",
        number: 1,
        route: "Test Route",
        climbers: ["Kay"],
      };

      await expect(
        source.parseAscent(ascent, 0, climberAbbrMap)
      ).rejects.toThrow(ProcessingError);
      await expect(
        source.parseAscent(ascent, 0, climberAbbrMap)
      ).rejects.toThrow("invalid date format");
    });
  });

  describe("validate", () => {
    test("should validate correct ascents data", async () => {
      const testData = {
        ascents: [
          {
            date: new Date("2023-05-01T00:00:00.001Z"),
            route: "Test Route",
            climbers: [{ climber: "Kay Sauerländer", isAborted: false }],
          },
        ],
        metadata: {
          totalProcessed: 1,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result).toHaveProperty("ascents");
      expect(result).toHaveProperty("metadata");
      expect(result.ascents).toHaveLength(1);
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
    });

    test("should detect conflicting exclusive fields", async () => {
      const testData = {
        ascents: [
          {
            date: new Date("2023-05-01T00:00:00.001Z"),
            route: "Test Route",
            climbers: [{ climber: "Kay Sauerländer", isAborted: false }],
            leadClimber: "Kay Sauerländer",
            isSolo: true, // Conflict with leadClimber
          },
        ],
        metadata: {
          totalProcessed: 1,
          processedAt: new Date(),
          sourceFiles: ["test.json"],
        },
      };
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      const result = await source.validate(testData);

      expect(result.ascents).toHaveLength(0); // Invalid ascent filtered out
      expect(result.metadata.validationResults.errors).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Validation found 1 errors"),
        expect.any(Object)
      );
    });

    test("should throw ProcessingError for invalid data structure", async () => {
      const source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);

      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        ProcessingError
      );
      await expect(source.validate({ not: "valid" })).rejects.toThrow(
        "Invalid data structure: ascents must be an array"
      );
    });
  });

  describe("validateConsecutiveMilliseconds", () => {
    let source;

    beforeEach(() => {
      source = new AscentsSource({ inputFile: fixtureFile }, mockLogger);
    });

    test("should validate correct consecutive milliseconds", () => {
      const baseDate = new Date("2023-05-01");
      baseDate.setHours(0, 0, 0, 0);

      const ascents = [
        {
          date: new Date(baseDate.getTime() + 1),
          route: "Route 1",
          climbers: [{ climber: "Kay", isAborted: false }],
        },
        {
          date: new Date(baseDate.getTime() + 2),
          route: "Route 2",
          climbers: [{ climber: "Kay", isAborted: false }],
        },
      ];
      const warnings = [];

      source.validateConsecutiveMilliseconds(ascents, warnings);

      expect(warnings).toHaveLength(0);
    });

    test("should detect incorrect consecutive milliseconds", () => {
      const baseDate = new Date("2023-05-01");
      baseDate.setHours(0, 0, 0, 0);

      const ascents = [
        {
          date: new Date(baseDate.getTime() + 1),
          route: "Route 1",
          climbers: [{ climber: "Kay", isAborted: false }],
        },
        {
          date: new Date(baseDate.getTime() + 5), // Should be +2
          route: "Route 2",
          climbers: [{ climber: "Kay", isAborted: false }],
        },
      ];
      const warnings = [];

      source.validateConsecutiveMilliseconds(ascents, warnings);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        type: "consecutive_milliseconds",
        message: expect.stringContaining(
          "does not have consecutive milliseconds"
        ),
      });
    });
  });

  describe("process", () => {
    test("should process ascents data end-to-end", async () => {
      const testData = {
        climberAbbrMap: {
          Kay: "Kay Sauerländer",
          Ben: "Ben Sauerländer",
        },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route 1",
            climbers: ["Kay", "Ben"],
            leadClimber: "Kay",
          },
          {
            date: "2023-05-01",
            number: 2,
            route: "Test Route 2",
            climbers: ["Kay", "(Ben)"],
            isAborted: true,
          },
        ],
      };
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new AscentsSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.process();

      expect(result).toHaveProperty("ascents");
      expect(result).toHaveProperty("metadata");
      expect(result.ascents).toHaveLength(2);

      // Check first ascent
      expect(result.ascents[0]).toMatchObject({
        route: "Test Route 1",
        leadClimber: "Kay Sauerländer",
        climbers: [
          { climber: "Kay Sauerländer", isAborted: false },
          { climber: "Ben Sauerländer", isAborted: false },
        ],
      });

      // Check second ascent with aborted climber
      expect(result.ascents[1]).toMatchObject({
        route: "Test Route 2",
        isAborted: true,
        climbers: [
          { climber: "Kay Sauerländer", isAborted: false },
          { climber: "Ben Sauerländer", isAborted: true },
        ],
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[AscentsSource] process: Data processing completed"
        ),
        expect.any(Object)
      );
    });
  });

  describe("caching functionality", () => {
    test("should process and cache data when cache is enabled", async () => {
      const testData = {
        climberAbbrMap: { Kay: "Kay Sauerländer" },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route",
            climbers: ["Kay"],
          },
        ],
      };
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new AscentsSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      const result = await source.process();

      expect(result.ascents).toHaveLength(1);

      // Verify data was cached
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toMatchObject({
        ascents: expect.any(Array),
        metadata: expect.any(Object),
      });
    });

    test("should use cached data when available", async () => {
      const testData = {
        climberAbbrMap: { Kay: "Kay Sauerländer" },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Test Route",
            climbers: ["Kay"],
          },
        ],
      };
      await fs.writeFile(testInputFile, JSON.stringify(testData));

      const source = new AscentsSource(
        {
          inputFile: testInputFile,
          cache: { enabled: true },
        },
        mockLogger,
        cache
      );

      // First call should process and cache
      await source.process();

      // Second call should use cache
      await source.process();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Using cached data for AscentsSource"
      );
    });
  });

  describe("integration test with real data structure", () => {
    test("should process ascents data matching the provided structure", async () => {
      const mockData = {
        climberAbbrMap: {
          Kay: "Kay Sauerländer",
          Ben: "Ben Sauerländer",
          Tom: "Tom Sauerländer",
        },
        ascents: [
          {
            date: "2023-05-01",
            number: 1,
            route: "Schusterweg",
            climbers: ["Kay", "Ben"],
            leadClimber: "Kay",
          },
          {
            date: "2023-05-01",
            number: 2,
            route: "AW",
            climbers: ["Kay", "(Ben)"],
            leadClimber: "Kay",
            isAborted: true,
            notes: "Abbruch nach 2. Seillänge",
          },
          {
            date: "2023-05-02",
            number: 1,
            route: "Solo Route",
            climbers: ["Kay"],
            isSolo: true,
          },
          {
            date: "2023-05-02",
            number: 2,
            route: "TopRope Route",
            climbers: ["Ben", "Tom"],
            isTopRope: true,
          },
        ],
      };

      await fs.writeFile(testInputFile, JSON.stringify(mockData));

      const source = new AscentsSource(
        { inputFile: testInputFile },
        mockLogger
      );
      const result = await source.process();

      expect(result).toHaveProperty("ascents");
      expect(result).toHaveProperty("metadata");
      expect(result.ascents).toHaveLength(4);

      // Verify consecutive milliseconds for same day
      const day1Ascents = result.ascents.filter(
        (a) => a.date.toDateString() === new Date("2023-05-01").toDateString()
      );
      expect(day1Ascents).toHaveLength(2);

      const baseDate1 = new Date("2023-05-01");
      baseDate1.setHours(0, 0, 0, 0);
      expect(day1Ascents[0].date.getTime()).toBe(baseDate1.getTime() + 1);
      expect(day1Ascents[1].date.getTime()).toBe(baseDate1.getTime() + 2);

      // Check specific ascent with aborted climber
      const abortedAscent = result.ascents.find((a) => a.route === "AW");
      expect(abortedAscent).toMatchObject({
        route: "AW",
        leadClimber: "Kay Sauerländer",
        isAborted: true,
        notes: "Abbruch nach 2. Seillänge",
        climbers: [
          { climber: "Kay Sauerländer", isAborted: false },
          { climber: "Ben Sauerländer", isAborted: true },
        ],
      });

      // Check solo ascent
      const soloAscent = result.ascents.find((a) => a.route === "Solo Route");
      expect(soloAscent).toMatchObject({
        route: "Solo Route",
        isSolo: true,
        climbers: [{ climber: "Kay Sauerländer", isAborted: false }],
      });
    });
  });

  describe("getSourceFiles", () => {
    test("should handle getSourceFiles for multiple files", () => {
      const inputFiles = ["/path/file1.json", "/path/file2.json"];
      const source = new AscentsSource({ inputFiles }, mockLogger, cache);

      const sourceFiles = source.getSourceFiles();

      expect(sourceFiles).toEqual(inputFiles);
    });

    test("should handle getSourceFiles for single file", () => {
      const inputFile = "/path/single-file.json";
      const source = new AscentsSource({ inputFile }, mockLogger, cache);

      const sourceFiles = source.getSourceFiles();

      expect(sourceFiles).toEqual([inputFile]);
    });
  });
});
