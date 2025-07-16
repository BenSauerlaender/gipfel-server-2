const path = require("path");
const fs = require("fs").promises;
const os = require("os");
const TeufelsturmRoutesSource = require("../../lib/sources/teufelsturm-routes-source");
const SimpleCache = require("../../lib/core/simple-cache");

describe("TeufelsturmRoutesSource", () => {
  let source;
  let mockLogger;
  let cache;
  let tempDir;
  let sampleHtmlPath;

  beforeEach(async () => {
    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create temporary directory for cache
    tempDir = path.join(__dirname, "../temp", `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    cache = new SimpleCache({
      cacheDir: path.join(tempDir, "cache"),
      logger: mockLogger,
    });

    // Copy sample HTML to temp directory
    sampleHtmlPath = path.join(tempDir, "sample.html");
    const sampleHtml = await fs.readFile(
      path.join(__dirname, "../fixtures/sample-teufelsturm.html"),
      "utf8"
    );
    await fs.writeFile(sampleHtmlPath, sampleHtml);

    const config = {
      inputFiles: [sampleHtmlPath],
      cache: { enabled: true },
    };

    source = new TeufelsturmRoutesSource(config, mockLogger, cache);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    test("should initialize with correct properties", () => {
      expect(source.sourceName).toBe("TeufelsturmRoutesSource");
      expect(source.cacheEnabled).toBe(true);
      expect(source.SCALA).toContain("VIIa");
      expect(source.scoreMap["arrow-upright"]).toBe("1");
    });
  });

  describe("fetch", () => {
    test("should load HTML files successfully", async () => {
      const result = await source.fetch();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("filePath", sampleHtmlPath);
      expect(result[0]).toHaveProperty("content");
      expect(result[0].content).toContain("Testgipfel");
    });

    test("should handle missing files gracefully", async () => {
      source.config.inputFiles = ["/nonexistent/file.html"];

      await expect(source.fetch()).rejects.toThrow(
        "No HTML files could be loaded"
      );
    });

    test("should warn about missing files but continue with existing ones", async () => {
      source.config.inputFiles = [sampleHtmlPath, "/nonexistent/file.html"];

      const result = await source.fetch();
      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe(sampleHtmlPath);
    });
  });

  describe("parse", () => {
    test("should parse HTML content correctly", async () => {
      const htmlFiles = await source.fetch();
      const result = await source.parse(htmlFiles);

      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");

      // Check regions
      expect(result.regions).toContainEqual({ name: "Testgebiet" });
      expect(result.regions).toContainEqual({ name: "Grosser Zschand" });
      expect(result.regions).toContainEqual({ name: "Rathener Gebiet" });

      // Check summits
      const testSummit = result.summits.find((s) => s.name === "Testgipfel");
      expect(testSummit).toBeDefined();
      expect(testSummit.region).toBe("Testgebiet");

      // Check routes
      const testRoute = result.routes.find((r) => r.name === "Testroute");
      expect(testRoute).toBeDefined();
      expect(testRoute.summit).toBe("Testgipfel");
      expect(testRoute.teufelsturmId).toBe("12345");
      expect(testRoute.teufelsturmScore).toBe("1");
    });

    test("should handle comma-separated summit names", async () => {
      const htmlFiles = await source.fetch();
      const result = await source.parse(htmlFiles);

      const summit = result.summits.find((s) => s.name === "Großes Seehorn");
      expect(summit).toBeDefined();
      expect(summit.name).toBe("Großes Seehorn");
    });
  });

  describe("resolveDifficulty", () => {
    test("should parse simple difficulty", () => {
      const result = source.resolveDifficulty("VIIa");

      expect(result.difficulty.normal).toBe("VIIa");
      expect(result.unsecure).toBe(false);
      expect(result.stars).toBe(0);
    });

    test("should parse difficulty with stars", () => {
      const result = source.resolveDifficulty("* IV");

      expect(result.difficulty.normal).toBe("IV");
      expect(result.stars).toBe(1);
    });

    test("should parse difficulty with RP grade", () => {
      const result = source.resolveDifficulty("* VIIc RP VIIIa");

      expect(result.difficulty.normal).toBe("VIIc");
      expect(result.difficulty.RP).toBe("VIIIa");
      expect(result.stars).toBe(1);
    });

    test("should parse difficulty with parentheses (without support)", () => {
      const result = source.resolveDifficulty("V (VI)");

      expect(result.difficulty.normal).toBe("V");
      expect(result.difficulty.withoutSupport).toBe("VI");
    });

    test("should parse unsecure routes", () => {
      const result = source.resolveDifficulty("! IV");

      expect(result.difficulty.normal).toBe("IV");
      expect(result.unsecure).toBe(true);
    });
  });

  describe("fixSummitName", () => {
    const fixSummitName = require("../../lib/util/fixSummitName");

    test("should fix comma-separated names", () => {
      expect(fixSummitName("Seehorn, Großes")).toBe("Großes Seehorn");
    });

    test("should leave normal names unchanged", () => {
      expect(fixSummitName("Testgipfel")).toBe("Testgipfel");
    });
  });

  describe("validate", () => {
    test("should validate correct data structure", async () => {
      const htmlFiles = await source.fetch();
      const parsedData = await source.parse(htmlFiles);

      const result = await source.validate(parsedData);

      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
      expect(result.metadata.validationResults).toHaveProperty(
        "totalValidated"
      );
      expect(result.metadata.validationResults).toHaveProperty("errors");
      expect(result.metadata.validationResults).toHaveProperty("warnings");
    });

    test("should reject invalid data structure", async () => {
      const invalidData = { regions: "not an array" };

      await expect(source.validate(invalidData)).rejects.toThrow(
        "regions must be an array"
      );
    });

    test("should validate routes with at least one difficulty", async () => {
      const validData = {
        regions: [{ name: "Test Region" }],
        summits: [{ name: "Test Summit", region: "Test Region" }],
        routes: [
          {
            name: "Valid Route",
            summit: "Test Summit",
            region: "Test Region",
            teufelsturmId: "123",
            teufelsturmScore: "1",
            difficulty: {
              normal: "VIIa",
              jump: undefined,
              RP: undefined,
              withoutSupport: undefined,
            },
          },
        ],
        metadata: {
          totalProcessed: 1,
          processedAt: new Date(),
          sourceFiles: [],
        },
      };

      const result = await source.validate(validData);

      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("metadata");
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].name).toBe("Valid Route");
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
      expect(result.metadata.validationResults.totalValidated).toBe(1);
      expect(result.metadata.validationResults.errors).toBe(0);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("difficulty validation errors")
      );
    });

    test("should exclude routes without any difficulty", async () => {
      const invalidData = {
        regions: [{ name: "Test Region" }],
        summits: [{ name: "Test Summit", region: "Test Region" }],
        routes: [
          {
            name: "Valid Route",
            summit: "Test Summit",
            region: "Test Region",
            teufelsturmId: "456",
            teufelsturmScore: "1",
            difficulty: {
              normal: "VIIa",
              jump: undefined,
              RP: undefined,
              withoutSupport: undefined,
            },
          },
          {
            name: "Invalid Route",
            summit: "Test Summit",
            region: "Test Region",
            teufelsturmId: "123",
            teufelsturmScore: "1",
            difficulty: {
              normal: undefined,
              jump: undefined,
              RP: undefined,
              withoutSupport: undefined,
            },
          },
        ],
        metadata: {
          totalProcessed: 2,
          processedAt: new Date(),
          sourceFiles: [],
        },
      };

      const result = await source.validate(invalidData);

      // Should only return valid routes
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].name).toBe("Valid Route");
      expect(result.metadata.validationResults.totalValidated).toBe(1);
      expect(result.metadata.validationResults.errors).toBe(1);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Validation found 1 invalid routes (excluded from results)",
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              route: "Invalid Route at Test Summit (Test Region)",
              error: "Route must have at least one difficulty set",
              teufelsturmId: "123",
            }),
          ]),
        })
      );
    });

    test("should warn about invalid difficulty values", async () => {
      const invalidData = {
        regions: [{ name: "Test Region" }],
        summits: [{ name: "Test Summit", region: "Test Region" }],
        routes: [
          {
            name: "Invalid Difficulty Route",
            summit: "Test Summit",
            region: "Test Region",
            teufelsturmId: "123",
            teufelsturmScore: "1",
            difficulty: {
              normal: "INVALID_GRADE",
              jump: "10",
              RP: "INVALID_RP",
              withoutSupport: "INVALID_WS",
            },
          },
        ],
        metadata: {
          totalProcessed: 1,
          processedAt: new Date(),
          sourceFiles: [],
        },
      };

      const result = await source.validate(invalidData);

      // Route should still be included despite invalid difficulty values
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].name).toBe("Invalid Difficulty Route");
      expect(result.metadata.validationResults.totalValidated).toBe(1);
      expect(result.metadata.validationResults.warnings).toBe(4);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Validation found 4 route warnings",
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.objectContaining({
              route: "Invalid Difficulty Route at Test Summit (Test Region)",
              warning: expect.stringContaining(
                "Invalid normal difficulty 'INVALID_GRADE'"
              ),
              teufelsturmId: "123",
            }),
            expect.objectContaining({
              route: "Invalid Difficulty Route at Test Summit (Test Region)",
              warning: expect.stringContaining("Invalid jump difficulty '10'"),
              teufelsturmId: "123",
            }),
            expect.objectContaining({
              route: "Invalid Difficulty Route at Test Summit (Test Region)",
              warning: expect.stringContaining(
                "Invalid RP difficulty 'INVALID_RP'"
              ),
              teufelsturmId: "123",
            }),
            expect.objectContaining({
              route: "Invalid Difficulty Route at Test Summit (Test Region)",
              warning: expect.stringContaining(
                "Invalid withoutSupport difficulty 'INVALID_WS'"
              ),
              teufelsturmId: "123",
            }),
          ]),
        })
      );
    });

    test("should accept valid difficulty values", async () => {
      const validData = {
        regions: [{ name: "Test Region" }],
        summits: [{ name: "Test Summit", region: "Test Region" }],
        routes: [
          {
            name: "Valid Route",
            summit: "Test Summit",
            region: "Test Region",
            teufelsturmId: "123",
            teufelsturmScore: "1",
            difficulty: {
              normal: "VIIa",
              jump: "3",
              RP: "VIIIb",
              withoutSupport: "VI",
            },
          },
        ],
        metadata: {
          totalProcessed: 1,
          processedAt: new Date(),
          sourceFiles: [],
        },
      };

      await source.validate(validData);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("difficulty validation warnings")
      );
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("difficulty validation errors")
      );
    });
  });

  describe("validateRouteDifficulty", () => {
    test("should return true for route with normal difficulty", () => {
      const route = {
        difficulty: {
          normal: "VIIa",
          jump: undefined,
          RP: undefined,
          withoutSupport: undefined,
        },
      };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(true);
    });

    test("should return true for route with jump difficulty", () => {
      const route = {
        difficulty: {
          normal: undefined,
          jump: "3",
          RP: undefined,
          withoutSupport: undefined,
        },
      };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(true);
    });

    test("should return true for route with RP difficulty", () => {
      const route = {
        difficulty: {
          normal: undefined,
          jump: undefined,
          RP: "VIIIa",
          withoutSupport: undefined,
        },
      };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(true);
    });

    test("should return true for route with withoutSupport difficulty", () => {
      const route = {
        difficulty: {
          normal: undefined,
          jump: undefined,
          RP: undefined,
          withoutSupport: "VI",
        },
      };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(true);
    });

    test("should return false for route without any difficulty", () => {
      const route = {
        difficulty: {
          normal: undefined,
          jump: undefined,
          RP: undefined,
          withoutSupport: undefined,
        },
      };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(false);
    });

    test("should return false for route with null difficulty", () => {
      const route = { difficulty: null };
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(false);
    });

    test("should return false for route without difficulty property", () => {
      const route = {};
      const result = source.validateRouteDifficulty(route, "Test Route");
      expect(result).toBe(false);
    });
  });

  describe("validateDifficultyValues", () => {
    test("should not add warnings for valid difficulties", () => {
      const route = {
        difficulty: {
          normal: "VIIa",
          jump: "3",
          RP: "VIIIb",
          withoutSupport: "VI",
        },
        teufelsturmId: "123",
      };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(0);
    });

    test("should add warning for invalid normal difficulty", () => {
      const route = {
        difficulty: { normal: "INVALID" },
        teufelsturmId: "123",
      };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        route: "Test Route",
        warning: expect.stringContaining("Invalid normal difficulty 'INVALID'"),
        teufelsturmId: "123",
      });
    });

    test("should add warning for invalid jump difficulty", () => {
      const route = {
        difficulty: { jump: "10" },
        teufelsturmId: "123",
      };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        route: "Test Route",
        warning: expect.stringContaining("Invalid jump difficulty '10'"),
        teufelsturmId: "123",
      });
    });

    test("should add warning for invalid RP difficulty", () => {
      const route = {
        difficulty: { RP: "INVALID_RP" },
        teufelsturmId: "123",
      };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        route: "Test Route",
        warning: expect.stringContaining("Invalid RP difficulty 'INVALID_RP'"),
        teufelsturmId: "123",
      });
    });

    test("should add warning for invalid withoutSupport difficulty", () => {
      const route = {
        difficulty: { withoutSupport: "INVALID_WS" },
        teufelsturmId: "123",
      };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        route: "Test Route",
        warning: expect.stringContaining(
          "Invalid withoutSupport difficulty 'INVALID_WS'"
        ),
        teufelsturmId: "123",
      });
    });

    test("should handle route without difficulty object", () => {
      const route = { difficulty: null, teufelsturmId: "123" };
      const warnings = [];

      source.validateDifficultyValues(route, "Test Route", warnings);

      expect(warnings).toHaveLength(0);
    });
  });

  describe("caching", () => {
    test("should cache processed data", async () => {
      const result1 = await source.process();
      const result2 = await source.process();

      // Compare structure without exact date matching
      expect(result2.regions).toEqual(result1.regions);
      expect(result2.summits).toEqual(result1.summits);
      expect(result2.routes).toEqual(result1.routes);
      expect(result2.metadata.totalProcessed).toBe(
        result1.metadata.totalProcessed
      );

      // Verify cache was used (check logs or cache existence)
      const cacheKey = source.getCacheKey();
      const cached = await cache.get(cacheKey);
      expect(cached).toBeDefined();
    });

    test("should invalidate cache when source files change", async () => {
      // First process
      await source.process();

      // Modify source file
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure different mtime
      await fs.writeFile(sampleHtmlPath, "<html><body>Modified</body></html>");

      // Process again - should not use cache
      const cacheKey = source.getCacheKey();
      const sourceFiles = source.getSourceFiles();
      const isNewer = await cache.isSourceNewer(cacheKey, sourceFiles);

      expect(isNewer).toBe(true);
    });

    test("should work without cache when disabled", async () => {
      source.cacheEnabled = false;

      const result = await source.process();
      expect(result).toHaveProperty("routes");
      expect(result.routes.length).toBeGreaterThan(0);
    });
  });

  describe("getCacheKey", () => {
    test("should generate consistent cache key", () => {
      const key1 = source.getCacheKey();
      const key2 = source.getCacheKey();

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^teufelsturmroutessource_[a-f0-9]{8}$/);
    });

    test("should generate different keys for different configs", () => {
      const source2 = new TeufelsturmRoutesSource(
        { inputFiles: ["different.html"] },
        mockLogger,
        cache
      );

      const key1 = source.getCacheKey();
      const key2 = source2.getCacheKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe("getSourceFiles", () => {
    test("should return configured input files", () => {
      const files = source.getSourceFiles();
      expect(files).toEqual([sampleHtmlPath]);
    });
  });

  describe("clearCache", () => {
    test("should clear cache for this source", async () => {
      // Process to create cache
      await source.process();

      const cacheKey = source.getCacheKey();
      let cached = await cache.get(cacheKey);
      expect(cached).toBeDefined();

      // Clear cache
      await source.clearCache();

      cached = await cache.get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  describe("error handling", () => {
    test("should handle malformed HTML gracefully", async () => {
      const malformedHtml = "<html><body><table><tr><td>incomplete";
      await fs.writeFile(sampleHtmlPath, malformedHtml);

      const result = await source.process();

      // Should still return valid structure even with no routes
      expect(result).toHaveProperty("routes");
      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
    });

    test("should handle missing teufelsturmId gracefully", async () => {
      const htmlWithoutId = `
        <html><body><table>
        <tr>
          <td>1</td>
          <td>Test Summit</td>
          <td><a href="http://example.com/route" target="_blank">Test Route</a></td>
          <td><img src="arrow-upright.gif"></td>
          <td>VIIa</td>
          <td>Test Region</td>
        </tr>
        </table></body></html>
      `;
      await fs.writeFile(sampleHtmlPath, htmlWithoutId);

      const result = await source.process();

      // Should filter out routes without teufelsturmId
      expect(result.routes).toHaveLength(0);
    });
  });

  describe("integration", () => {
    test("should process real sample data end-to-end", async () => {
      const result = await source.process();

      expect(result.metadata.totalProcessed).toBeGreaterThan(0);
      expect(result.regions.length).toBeGreaterThan(0);
      expect(result.summits.length).toBeGreaterThan(0);
      expect(result.routes.length).toBeGreaterThan(0);

      // Verify data integrity
      result.routes.forEach((route) => {
        expect(route.name).toBeTruthy();
        expect(route.summit).toBeTruthy();
        expect(route.region).toBeTruthy();
        expect(route.teufelsturmId).toBeTruthy();
        expect(route.teufelsturmScore).toBeDefined();
        expect(route.difficulty).toBeDefined();
      });
    });
  });
});
