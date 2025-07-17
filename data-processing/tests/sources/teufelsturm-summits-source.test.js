const TeufelsturmSummitsSource = require("../../lib/sources/teufelsturm-summits-source");
const SimpleCache = require("../../lib/core/simple-cache");
const ProcessingError = require("../../lib/core/error");
const fs = require("fs").promises;
const path = require("path");

describe("TeufelsturmSummitsSource", () => {
  let source;
  let mockLogger;
  let mockCache;
  let testConfig;
  let fixtureFile;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      isSourceNewer: jest.fn(),
    };

    // Use test fixture file
    fixtureFile = path.join(
      __dirname,
      "../fixtures/sample-teufelsturm-summits.html"
    );

    testConfig = {
      inputFile: fixtureFile,
      cache: {
        enabled: true,
      },
    };

    source = new TeufelsturmSummitsSource(testConfig, mockLogger);
    source.cache = mockCache;
  });

  describe("constructor", () => {
    test("should throw error when no input files configured", () => {
      expect(() => {
        new TeufelsturmSummitsSource({}, mockLogger, mockCache);
      }).toThrow(ProcessingError);
      expect(() => {
        new TeufelsturmSummitsSource({}, mockLogger, mockCache);
      }).toThrow(
        "TeufelsturmSummitsSource requires either inputFile or inputFiles to be configured"
      );
    });

    test("should use provided single file configuration", () => {
      const config = {
        inputFile: "/custom/path/summits.html",
        cache: { enabled: false },
      };
      const source = new TeufelsturmSummitsSource(
        config,
        mockLogger,
        mockCache
      );

      expect(source.inputFiles).toEqual(["/custom/path/summits.html"]);
      expect(source.cacheEnabled).toBe(false);
    });

    test("should use provided multiple files configuration", () => {
      const config = {
        inputFiles: ["/path/file1.html", "/path/file2.html"],
        cache: { enabled: true },
      };
      const source = new TeufelsturmSummitsSource(
        config,
        mockLogger,
        mockCache
      );

      expect(source.inputFiles).toEqual([
        "/path/file1.html",
        "/path/file2.html",
      ]);
      expect(source.cacheEnabled).toBe(true);
    });
  });

  describe("processHtmlFile", () => {
    it("should extract summit data from HTML content", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=123">Testgipfel, Hoher</a></td>
            <td>2500m</td>
            <td>Testregion</td>
          </tr>
          <tr>
            <td>2</td>
            <td><a href="summit.php?gipfelnr=456">Berggipfel</a></td>
            <td>3000m</td>
            <td>Alpenregion</td>
          </tr>
        </table>
      `;

      const result = await source.processHtmlFile(htmlContent);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "Hoher Testgipfel",
        region: "Testregion",
        teufelsturmId: "123",
      });
      expect(result[1]).toEqual({
        name: "Berggipfel",
        region: "Alpenregion",
        teufelsturmId: "456",
      });
    });

    it("should handle summit names with commas correctly", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=789">Spitze, Große</a></td>
            <td>2800m</td>
            <td>Bergregion</td>
          </tr>
        </table>
      `;

      const result = await source.processHtmlFile(htmlContent);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Große Spitze");
    });

    it("should skip rows without summit links", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>Header</td>
            <td>Column</td>
            <td>Data</td>
            <td>Info</td>
          </tr>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=123">Valid Summit</a></td>
            <td>2500m</td>
            <td>Valid Region</td>
          </tr>
        </table>
      `;

      const result = await source.processHtmlFile(htmlContent);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Valid Summit");
    });

    it("should skip rows with insufficient columns", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td>2</td>
          </tr>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=123">Valid Summit</a></td>
            <td>2500m</td>
            <td>Valid Region</td>
          </tr>
        </table>
      `;

      const result = await source.processHtmlFile(htmlContent);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Valid Summit");
    });

    it("should handle missing teufelsturmId gracefully", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=">Summit Without ID</a></td>
            <td>2500m</td>
            <td>Test Region</td>
          </tr>
        </table>
      `;

      const result = await source.processHtmlFile(htmlContent);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "Summit Without ID",
        region: "Test Region",
        teufelsturmId: null,
      });
    });
  });

  describe("extractUniqueRegions", () => {
    it("should extract unique regions from summit data", () => {
      const summits = [
        { name: "Summit1", region: "Region A", teufelsturmId: "1" },
        { name: "Summit2", region: "Region B", teufelsturmId: "2" },
        { name: "Summit3", region: "Region A", teufelsturmId: "3" },
      ];

      const result = source.extractUniqueRegions(summits);

      expect(result).toHaveLength(2);
      expect(result).toEqual([{ name: "Region A" }, { name: "Region B" }]);
    });

    it("should handle empty summit array", () => {
      const result = source.extractUniqueRegions([]);
      expect(result).toEqual([]);
    });
  });

  describe("extractUniqueSummits", () => {
    it("should extract unique summits from summit data", () => {
      const summits = [
        { name: "Summit1", region: "Region A", teufelsturmId: "1" },
        { name: "Summit1", region: "Region A", teufelsturmId: "1" }, // duplicate
        { name: "Summit2", region: "Region B", teufelsturmId: "2" },
      ];

      const result = source.extractUniqueSummits(summits);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { name: "Summit1", region: "Region A", teufelsturmId: "1" },
        { name: "Summit2", region: "Region B", teufelsturmId: "2" },
      ]);
    });

    it("should handle empty summit array", () => {
      const result = source.extractUniqueSummits([]);
      expect(result).toEqual([]);
    });
  });

  describe("parse", () => {
    it("should parse HTML content and return structured data", async () => {
      const htmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=123">Test Summit</a></td>
            <td>2500m</td>
            <td>Test Region</td>
          </tr>
        </table>
      `;

      const fileDataArray = [
        {
          filePath: testConfig.inputFile,
          content: htmlContent,
        },
      ];

      const result = await source.parse(fileDataArray);

      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
      expect(result).toHaveProperty("metadata");
      expect(result.regions).toHaveLength(1);
      expect(result.summits).toHaveLength(1);
      expect(result.summits[0]).toEqual({
        name: "Test Summit",
        region: "Test Region",
        teufelsturmId: "123",
      });

      // Verify sourceFiles metadata is included
      expect(result.metadata).toHaveProperty("sourceFiles");
      expect(Array.isArray(result.metadata.sourceFiles)).toBe(true);
      expect(result.metadata.sourceFiles).toEqual([testConfig.inputFile]);
    });
  });

  describe("validate", () => {
    it("should validate correct data structure", async () => {
      const validData = {
        regions: [{ name: "Test Region" }],
        summits: [
          { name: "Test Summit", region: "Test Region", teufelsturmId: "123" },
        ],
        metadata: { totalProcessed: 1, processedAt: new Date() },
      };

      const result = await source.validate(validData);

      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
      expect(result.metadata.validationResults.totalValidated).toBe(1);
      expect(result.metadata.validationResults.errors).toBe(0);
      expect(result.metadata.validationResults.warnings).toBe(0);
    });

    it("should throw error for invalid regions structure", async () => {
      const invalidData = {
        regions: "not an array",
        summits: [],
        metadata: {},
      };

      await expect(source.validate(invalidData)).rejects.toThrow(
        "Invalid data structure: regions must be an array"
      );
    });

    it("should throw error for invalid summits structure", async () => {
      const invalidData = {
        regions: [],
        summits: "not an array",
        metadata: {},
      };

      await expect(source.validate(invalidData)).rejects.toThrow(
        "Invalid data structure: summits must be an array"
      );
    });

    it("should warn about summits without teufelsturmId", async () => {
      const dataWithMissingIds = {
        regions: [{ name: "Test Region" }],
        summits: [
          { name: "Summit1", region: "Test Region", teufelsturmId: "123" },
          { name: "Summit2", region: "Test Region", teufelsturmId: null },
        ],
        metadata: { totalProcessed: 2, processedAt: new Date() },
      };

      const result = await source.validate(dataWithMissingIds);

      expect(result.metadata.validationResults.warnings).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Validation found 1 warnings in summit data",
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.objectContaining({
              type: "missing_teufelsturm_id",
              message: expect.stringContaining(
                'Summit "Summit2" in region "Test Region" is missing teufelsturmId'
              ),
            }),
          ]),
        })
      );
    });
  });

  describe("caching", () => {
    it("should use cached data when available and valid", async () => {
      const cachedData = {
        regions: [{ name: "Cached Region" }],
        summits: [{ name: "Cached Summit", region: "Cached Region" }],
        metadata: {
          processedAt: new Date("2023-01-01T00:00:00.000Z"),
          totalProcessed: 1,
          sourceFiles: [fixtureFile],
        },
      };

      // Mock cache to indicate data is available and up-to-date
      mockCache.isSourceNewer.mockResolvedValue(false);
      mockCache.get.mockResolvedValue(cachedData);

      const result = await source.process();

      expect(result).toEqual(cachedData);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Using cached data for TeufelsturmSummitsSource"
      );
    });

    it("should cache processed data", async () => {
      // Mock fetch to return HTML content in correct format
      const mockHtmlContent = `
        <table>
          <tr>
            <td>1</td>
            <td><a href="summit.php?gipfelnr=123">Test Summit</a></td>
            <td>2500m</td>
            <td>Test Region</td>
          </tr>
        </table>
      `;

      const mockFileDataArray = [
        {
          filePath: "test.html",
          content: mockHtmlContent,
        },
      ];

      // Mock the fetch method and cache methods
      source.fetch = jest.fn().mockResolvedValue(mockFileDataArray);
      mockCache.get.mockResolvedValue(null); // No cached data
      mockCache.isSourceNewer.mockResolvedValue(true); // Source is newer

      const result = await source.process();

      expect(mockCache.set).toHaveBeenCalled();
      expect(result).toHaveProperty("regions");
      expect(result).toHaveProperty("summits");
    });
  });

  describe("getCacheKey", () => {
    it("should generate consistent cache keys", () => {
      const key1 = source.getCacheKey();
      const key2 = source.getCacheKey();
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^teufelsturmsummitssource_[a-f0-9]{8}$/);
    });

    it("should generate different cache keys for different configs", () => {
      const config1 = { inputFile: "file1.html" };
      const config2 = { inputFile: "file2.html" };

      const source1 = new TeufelsturmSummitsSource(
        config1,
        mockLogger,
        mockCache
      );
      const source2 = new TeufelsturmSummitsSource(
        config2,
        mockLogger,
        mockCache
      );

      expect(source1.getCacheKey()).not.toBe(source2.getCacheKey());
    });
  });

  describe("getSourceFiles", () => {
    test("should return input file path", () => {
      const inputFile = "/test/summits.html";
      const source = new TeufelsturmSummitsSource(
        { inputFile },
        mockLogger,
        mockCache
      );

      const sourceFiles = source.getSourceFiles();

      expect(sourceFiles).toEqual([inputFile]);
    });
  });
});
