const OSMLocationsSource = require("../../lib/sources/osm-locations-source");
const SimpleCache = require("../../lib/core/simple-cache");
const ProcessingError = require("../../lib/core/error");
const Logger = require("../../lib/core/logger");
const fs = require("fs").promises;
const path = require("path");

describe("OSMLocationsSource", () => {
  let source;
  let mockLogger;
  let mockCache;
  let mockProcessor;
  let testConfig;

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

    mockProcessor = {
      processSource: jest.fn(),
    };

    testConfig = {
      inputFile: path.join(
        __dirname,
        "../fixtures/sample-osm-locations.geojson"
      ),
      dependencies: ["teufelsturmSummits", "teufelsturmRoutes"],
      cache: {
        enabled: true,
      },
    };

    source = new OSMLocationsSource(testConfig, mockLogger, mockCache);
  });

  describe("combineDependencies", () => {
    it("should collect summit data from multiple dependencies", () => {
      const dependencies = {
        teufelsturmSummits: {
          summits: [
            { name: "Summit1", region: "Region1", teufelsturmId: "1" },
            { name: "Summit2", region: "Region2", teufelsturmId: "2" },
          ],
        },
        teufelsturmRoutes: {
          summits: [{ name: "Summit3", region: "Region3", teufelsturmId: "3" }],
        },
      };

      const result = source.combineDependencies(dependencies);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: "Summit1",
        region: "Region1",
        teufelsturmId: "1",
      });
      expect(result[2]).toEqual({
        name: "Summit3",
        region: "Region3",
        teufelsturmId: "3",
      });
    });

    it("should handle dependencies without valid summits data", () => {
      const dependencies = {
        invalidDep: { data: "not summits" },
        validDep: {
          summits: [{ name: "Summit1", region: "Region1", teufelsturmId: "1" }],
        },
      };

      const result = source.combineDependencies(dependencies);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Summit1");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Dependency invalidDep does not contain valid summits data"
      );
    });

    it("should handle empty dependencies", () => {
      const result = source.combineDependencies({});
      expect(result).toEqual([]);
    });
  });

  describe("filterClimbingPoints", () => {
    it("should filter features for Point geometry with climbing tags", () => {
      const features = [
        {
          properties: {
            name: "Climbing Area",
            other_tags: "climbing=yes,sport=rock_climbing",
          },
          geometry: { type: "Point", coordinates: [10, 50] },
        },
        {
          properties: {
            name: "Regular Point",
            other_tags: "amenity=restaurant",
          },
          geometry: { type: "Point", coordinates: [11, 51] },
        },
        {
          properties: {
            name: "Climbing Polygon",
            other_tags: "climbing=yes",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [10, 50],
                [11, 51],
                [12, 52],
                [10, 50],
              ],
            ],
          },
        },
      ];

      const result = source.filterClimbingPoints(features);

      expect(result).toHaveLength(1);
      expect(result[0].properties.name).toBe("Climbing Area");
      expect(result[0].geometry.type).toBe("Point");
    });

    it("should handle features without other_tags", () => {
      const features = [
        {
          properties: { name: "No Tags" },
          geometry: { type: "Point", coordinates: [10, 50] },
        },
        {
          properties: {
            name: "With Climbing",
            other_tags: "climbing=yes",
          },
          geometry: { type: "Point", coordinates: [11, 51] },
        },
      ];

      const result = source.filterClimbingPoints(features);

      expect(result).toHaveLength(1);
      expect(result[0].properties.name).toBe("With Climbing");
    });

    it("should handle features without geometry", () => {
      const features = [
        {
          properties: {
            name: "No Geometry",
            other_tags: "climbing=yes",
          },
        },
        {
          properties: {
            name: "Point Feature",
            other_tags: "climbing=yes",
          },
          geometry: { type: "Point", coordinates: [10, 50] },
        },
      ];

      const result = source.filterClimbingPoints(features);

      expect(result).toHaveLength(1);
      expect(result[0].properties.name).toBe("Point Feature");
    });
  });

  describe("matchSummitsToPoints", () => {
    it("should match summits to climbing points by name", () => {
      const summits = [
        { name: "Summit Alpha", region: "Region1" },
        { name: "Summit Beta", region: "Region2" },
        { name: "Summit Gamma", region: "Region3" },
      ];

      const climbingPoints = [
        {
          properties: { name: "Summit Alpha" },
          geometry: { type: "Point", coordinates: [10.0, 50.0] },
        },
        {
          properties: { name: "Summit Beta" },
          geometry: { type: "Point", coordinates: [11.0, 51.0] },
        },
        {
          properties: { name: "Unknown Location" },
          geometry: { type: "Point", coordinates: [12.0, 52.0] },
        },
      ];

      const result = source.matchSummitsToPoints(summits, climbingPoints);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Summit Alpha");
      expect(result[0].gpsPosition).toEqual({ lng: 10.0, lat: 50.0 });
      expect(result[1].name).toBe("Summit Beta");
      expect(result[1].gpsPosition).toEqual({ lng: 11.0, lat: 51.0 });
    });

    it("should handle case-insensitive matching", () => {
      const summits = [{ name: "Summit Alpha", region: "Region1" }];

      const climbingPoints = [
        {
          properties: { name: "summit alpha" },
          geometry: { type: "Point", coordinates: [10.0, 50.0] },
        },
      ];

      const result = source.matchSummitsToPoints(summits, climbingPoints);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Summit Alpha");
      expect(result[0].gpsPosition).toEqual({ lng: 10.0, lat: 50.0 });
    });

    it("should handle points without names", () => {
      const summits = [{ name: "Summit Alpha", region: "Region1" }];

      const climbingPoints = [
        {
          properties: {},
          geometry: { type: "Point", coordinates: [10.0, 50.0] },
        },
        {
          properties: { name: null },
          geometry: { type: "Point", coordinates: [11.0, 51.0] },
        },
      ];

      const result = source.matchSummitsToPoints(summits, climbingPoints);

      expect(result).toHaveLength(0);
    });

    it("should handle summits without names", () => {
      const summits = [
        { region: "Region1" }, // No name property
        { name: "", region: "Region2" }, // Empty name
        { name: "Summit Alpha", region: "Region3" },
      ];

      const climbingPoints = [
        {
          properties: { name: "Summit Alpha" },
          geometry: { type: "Point", coordinates: [10.0, 50.0] },
        },
      ];

      const result = source.matchSummitsToPoints(summits, climbingPoints);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Summit Alpha");
    });

    it("should handle points without coordinates", () => {
      const summits = [{ name: "Summit Alpha", region: "Region1" }];

      const climbingPoints = [
        {
          properties: { name: "Summit Alpha" },
          geometry: { type: "Point", coordinates: null },
        },
        {
          properties: { name: "Summit Alpha" },
          geometry: { type: "Point", coordinates: [10] }, // Invalid coordinates
        },
      ];

      const result = source.matchSummitsToPoints(summits, climbingPoints);

      expect(result).toHaveLength(0);
    });
  });

  describe("fetch", () => {
    it("should fetch GeoJSON and pass through dependencies", async () => {
      const mockGeoJson = {
        type: "FeatureCollection",
        features: [
          {
            properties: { climbing: "yes", name: "Test Area" },
            geometry: { type: "Point", coordinates: [10, 50] },
          },
        ],
      };

      const dependencies = {
        teufelsturmSummits: {
          summits: [{ name: "Summit1", region: "Region1" }],
        },
      };

      // Mock file reading
      jest.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(mockGeoJson));

      const result = await source.fetch(dependencies);

      expect(result).toEqual([
        {
          filePath: testConfig.inputFile,
          geoJsonData: mockGeoJson,
          dependencies: dependencies,
          index: 0,
        },
      ]);
    });

    it("should throw error when file is not found", async () => {
      const mockError = new Error(
        "ENOENT: no such file or directory, open 'test.geojson'"
      );
      mockError.code = "ENOENT";
      jest.spyOn(fs, "readFile").mockRejectedValue(mockError);

      await expect(source.fetch({})).rejects.toThrow(ProcessingError);
      await expect(source.fetch({})).rejects.toThrow(
        "ENOENT: no such file or directory"
      );
    });
  });

  describe("validate", () => {
    it("should validate correct data structure", async () => {
      const validData = {
        locations: [{ properties: { name: "Test" }, matchType: "close_match" }],
        metadata: {
          totalFeatures: 1,
          processedAt: new Date(),
        },
      };

      const result = await source.validate(validData);

      expect(result).toHaveProperty("locations");
      expect(result).toHaveProperty("metadata");
      expect(result.metadata).toHaveProperty("validatedAt");
      expect(result.metadata).toHaveProperty("validationResults");
      expect(result.metadata.validationResults.totalValidated).toBe(0); // Invalid location should be excluded
      expect(result.metadata.validationResults.errors).toBe(1);
    });

    it("should throw error for invalid locations structure", async () => {
      const invalidData = {
        locations: "not an array",
        metadata: {},
      };

      await expect(source.validate(invalidData)).rejects.toThrow(
        "Invalid data structure: locations must be an array"
      );
    });

    it("should throw error for invalid metadata structure", async () => {
      const invalidData = {
        locations: [],
        metadata: "not an object",
      };

      await expect(source.validate(invalidData)).rejects.toThrow(
        "Invalid data structure: metadata must be an object"
      );
    });
  });

  describe("processor-level dependency resolution", () => {
    it("should work with processor-resolved dependencies", async () => {
      const source = new OSMLocationsSource(
        {
          inputFile: path.join(
            __dirname,
            "../fixtures/sample-osm-locations.geojson"
          ),
        },
        mockLogger,
        mockCache
      );

      const mockDependencies = {
        teufelsturmSummits: {
          summits: [
            { name: "Summit1", coordinates: { lat: 52.52, lon: 13.405 } },
          ],
        },
        teufelsturmRoutes: {
          routes: [{ name: "Route1" }],
        },
      };

      const result = await source.process(mockDependencies);

      expect(result.locations).toBeDefined();
      expect(result.metadata.matchedSummits).toBeDefined();
      expect(result.metadata.dependencies).toEqual([
        "teufelsturmSummits",
        "teufelsturmRoutes",
      ]);
    });

    it("should handle empty dependencies", async () => {
      const source = new OSMLocationsSource(
        {
          inputFile: path.join(
            __dirname,
            "../fixtures/sample-osm-locations.geojson"
          ),
        },
        mockLogger,
        mockCache
      );

      const result = await source.process({});

      expect(result.locations).toBeDefined();
      expect(result.metadata.matchedSummits).toBe(0);
      expect(result.metadata.dependencies).toEqual([]);
    });
  });

  describe("getSourceFiles", () => {
    it("should return input file path", () => {
      const result = source.getSourceFiles();
      expect(result).toEqual([testConfig.inputFile]);
    });

    it("should throw error when no input file specified", () => {
      expect(() => {
        new OSMLocationsSource({}, mockLogger, mockCache);
      }).toThrow(ProcessingError);
      expect(() => {
        new OSMLocationsSource({}, mockLogger, mockCache);
      }).toThrow(
        "OSMLocationsSource requires either inputFile or inputFiles to be configured"
      );
    });
  });
});
