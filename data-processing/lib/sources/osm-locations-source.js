const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const ErrorHandler = require("../core/error-handler");

/**
 * OSM locations data source handler
 * Processes GeoJSON Point data from OSM and matches names with summit data from dependencies
 */
class OSMLocationsSource extends BaseSource {
  constructor(config, logger, cache = null) {
    super(config, logger, cache);

    // Validate that input files are configured
    if (!config.inputFile && !config.inputFiles) {
      throw new ProcessingError(
        "OSMLocationsSource requires either inputFile or inputFiles to be configured",
        ProcessingError.Categories.CONFIG_ERROR,
        this.sourceName,
        { config }
      );
    }

    // Always use inputFiles array, wrap single file if needed
    this.inputFiles = config.inputFiles || [config.inputFile];
  }

  /**
   * Fetch GeoJSON content from configured input files
   * @param {Object} dependencies - Resolved dependency data
   * @returns {Promise<Array>} Array of file data objects with dependencies
   */
  async fetch(dependencies = {}) {
    this.logProgress(
      "fetch",
      `Loading ${this.inputFiles.length} GeoJSON files`
    );

    const fileDataArray = [];
    for (let i = 0; i < this.inputFiles.length; i++) {
      const filePath = this.inputFiles[i];
      try {
        this.logger.debug(`Reading GeoJSON file: ${filePath}`);
        const geoJsonContent = await fs.readFile(filePath, "utf8");
        const geoJsonData = JSON.parse(geoJsonContent);

        fileDataArray.push({
          filePath,
          geoJsonData,
          dependencies,
          index: i,
        });

        this.logProgress(
          "fetch",
          `Loaded GeoJSON with ${geoJsonData.features?.length || 0} features from ${filePath}`
        );
      } catch (error) {
        throw ErrorHandler.wrapError(
          error,
          ProcessingError.Categories.SOURCE_ERROR,
          this.sourceName,
          { inputFile: filePath }
        );
      }
    }

    return fileDataArray;
  }

  /**
   * Combine and validate dependencies
   * @param {Object} dependencies - Resolved dependency data
   * @returns {Array} Combined summit data from all dependencies
   */
  combineDependencies(dependencies) {
    const summitData = [];

    for (const [depName, depData] of Object.entries(dependencies)) {
      // Skip dependencies that were disabled or failed
      if (
        !depData ||
        depData.status === "skipped" ||
        depData.status === "error"
      ) {
        this.logger.debug(
          `Skipping dependency ${depName} (status: ${depData?.status || "missing"})`
        );
        continue;
      }

      if (depData.summits && Array.isArray(depData.summits)) {
        // Add summits without source information
        summitData.push(...depData.summits);
        this.logger.debug(
          `Collected ${depData.summits.length} summits from ${depName}`
        );
      } else {
        this.logger.warn(
          `Dependency ${depName} does not contain valid summits data`
        );
      }
    }

    return summitData;
  }

  /**
   * Parse GeoJSON data and match summits to climbing locations
   * @param {Array} fileDataArray - Array of file data objects
   * @param {Object} dependencies - Resolved dependency data (unused but required by interface)
   * @returns {Promise<Object>} Parsed location data with matched summits
   */
  async parse(fileDataArray, dependencies = {}) {
    try {
      this.logProgress(
        "parse",
        "Parsing GeoJSON and matching summits to climbing locations"
      );

      const allMatchedSummits = [];
      const sourceFiles = [];
      let totalFeatures = 0;
      let totalClimbingPoints = 0;

      // Process each file
      for (const fileData of fileDataArray) {
        const { filePath, geoJsonData, dependencies: deps } = fileData;
        sourceFiles.push(filePath);

        if (!geoJsonData.features || !Array.isArray(geoJsonData.features)) {
          throw new ProcessingError(
            `Invalid GeoJSON in ${filePath}: features array not found`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            { filePath }
          );
        }

        totalFeatures += geoJsonData.features.length;

        // Combine and validate dependencies
        const summitData = this.combineDependencies(deps);

        // Filter for Point features with climbing tags
        const climbingPoints = this.filterClimbingPoints(geoJsonData.features);
        totalClimbingPoints += climbingPoints.length;
        this.logger.debug(
          `Filtered to ${climbingPoints.length} climbing Point features from ${filePath}`
        );

        // Match summits to climbing points (not points to summits)
        const matchedSummits = this.matchSummitsToPoints(
          summitData,
          climbingPoints
        );
        allMatchedSummits.push(...matchedSummits);
      }

      const result = {
        locations: allMatchedSummits,
        metadata: {
          totalFeatures: totalFeatures,
          climbingPoints: totalClimbingPoints,
          matchedSummits: allMatchedSummits.length,
          processedAt: new Date(),
          sourceFiles: sourceFiles,
          dependencies:
            fileDataArray.length > 0
              ? Object.keys(fileDataArray[0].dependencies)
              : [],
        },
      };

      this.logProgress(
        "parse",
        `Processed ${allMatchedSummits.length} summits with climbing location matches from ${fileDataArray.length} files`
      );
      return result;
    } catch (error) {
      throw ErrorHandler.wrapError(
        error,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName
      );
    }
  }

  /**
   * Filter GeoJSON features for Point geometry with climbing tags
   * @param {Array} features - GeoJSON features array
   * @returns {Array} Filtered Point features with climbing tags
   */
  filterClimbingPoints(features) {
    return features.filter((feature) => {
      // Must be Point geometry
      if (!feature.geometry || feature.geometry.type !== "Point") {
        return false;
      }

      // Must have climbing tag in other_tags property
      const props = feature.properties;
      if (!props || !props.other_tags) {
        return false;
      }

      // Check if other_tags contains 'climbing'
      return (
        typeof props.other_tags === "string" &&
        props.other_tags.includes("climbing")
      );
    });
  }

  /**
   * Match summits to climbing points by name - only return summits that have a matching point
   * @param {Array} summits - Summit data from dependencies
   * @param {Array} climbingPoints - Filtered climbing Point features
   * @returns {Array} Summits with matched climbing location information
   */
  matchSummitsToPoints(summits, climbingPoints) {
    // Create a map of climbing point names for faster lookup
    const pointNameMap = new Map();
    climbingPoints.forEach((point) => {
      const pointName = point.properties?.name;
      if (pointName) {
        const coords = point.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
          pointNameMap.set(pointName.toLowerCase().trim(), {
            gpsPosition: {
              lng: coords[0],
              lat: coords[1],
            },
            originalPoint: point,
          });
        }
      }
    });

    // Only return summits that have a matching climbing point
    const matchedSummits = [];

    summits.forEach((summit) => {
      if (!summit.name) return;

      const summitName = summit.name.toLowerCase().trim();
      const matchedPoint = pointNameMap.get(summitName);

      if (matchedPoint) {
        this.logger.debug(`Summit match: ${summit.name} -> climbing point`);

        // Create clean summit object without unwanted fields
        const cleanSummit = {
          name: summit.name,
          region: summit.region,
          gpsPosition: matchedPoint.gpsPosition,
        };

        matchedSummits.push(cleanSummit);
      }
    });

    return matchedSummits;
  }

  /**
   * Validate parsed data
   * @param {Object} parsedData - Parsed data object
   * @returns {Promise<Object>} Validated data with metadata
   */
  async validate(parsedData) {
    await super.validate(parsedData);

    // Validate structure
    if (!parsedData.locations || !Array.isArray(parsedData.locations)) {
      throw new ProcessingError(
        "Invalid data structure: locations must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    if (!parsedData.metadata || typeof parsedData.metadata !== "object") {
      throw new ProcessingError(
        "Invalid data structure: metadata must be an object",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    this.logProgress(
      "validate",
      `Validating ${parsedData.locations.length} locations`
    );

    const validatedLocations = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < parsedData.locations.length; i++) {
      const location = parsedData.locations[i];

      try {
        const validatedLocation = await this.validateSingleLocation(
          location,
          i
        );
        validatedLocations.push(validatedLocation);
      } catch (error) {
        if (error instanceof ProcessingError) {
          errors.push({
            index: i,
            location: location,
            error: error.message,
          });
        } else {
          errors.push({
            index: i,
            location: location,
            error: `Unexpected validation error: ${error.message}`,
          });
        }
      }
    }

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} errors in location data`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `Validation found ${warnings.length} warnings in location data`,
        { warnings }
      );
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedLocations.length} locations (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      locations: validatedLocations,
      metadata: {
        ...parsedData.metadata,
        validatedAt: new Date(),
        validationResults: {
          totalValidated: validatedLocations.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      },
    };
  }

  /**
   * Validate a single location object
   * @param {Object} location - Location object to validate
   * @param {number} index - Index in the array for error reporting
   * @returns {Promise<Object>} Validated location object
   * @throws {ProcessingError} When validation fails
   */
  async validateSingleLocation(location, index) {
    if (typeof location !== "object" || location === null) {
      throw new ProcessingError(
        `Location at index ${index} must be an object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, location: location }
      );
    }

    if (!location.name || typeof location.name !== "string") {
      throw new ProcessingError(
        `Location at index ${index} must have a name string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, location: location }
      );
    }

    if (!location.gpsPosition || typeof location.gpsPosition !== "object") {
      throw new ProcessingError(
        `Location at index ${index} must have a gpsPosition object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, location: location }
      );
    }

    if (
      typeof location.gpsPosition.lat !== "number" ||
      typeof location.gpsPosition.lng !== "number"
    ) {
      throw new ProcessingError(
        `Location at index ${index} must have valid lat/lng coordinates`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, location: location }
      );
    }

    return {
      ...location,
      name: location.name.trim(),
    };
  }

  /**
   * Get source files that this processor depends on
   * @returns {Array} Array of source file paths
   */
  getSourceFiles() {
    return this.inputFiles;
  }
}

module.exports = OSMLocationsSource;
