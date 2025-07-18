const fs = require("fs");

class OsmLocationsImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(
      `Importing OSM location data from ${files.length} GeoJSON files:`
    );
    this.logger.debug(`files to import:`, files);

    const allLocations = [];
    let totalFeatures = 0;
    let totalClimbingPoints = 0;

    for (const file of files) {
      let fileData;
      try {
        this.logger.info(`Loading GeoJSON file: ${file}`);
        fileData = fs.readFileSync(file, "utf8");
      } catch (error) {
        this.logger.error(`Failed to load GeoJSON file: ${file}`, error);
        errors.push({ type: "FILE_LOADING", sourceFile: file });
        continue;
      }

      const result = this.processGeoJsonFile(fileData, file, dependencies);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      allLocations.push(...result.locations);
      totalFeatures += result.stats.totalFeatures;
      totalClimbingPoints += result.stats.climbingPoints;
    }

    // Remove duplicate locations
    const deduplicatedLocations = this.removeDuplicates(allLocations, warnings);

    this.logger.info(
      `Successfully processed ${deduplicatedLocations.length} locations`
    );
    if (allLocations.length > deduplicatedLocations.length) {
      this.logger.info(
        `Removed ${allLocations.length - deduplicatedLocations.length} duplicate locations`
      );
    }

    return {
      metadata: {
        sourceName: this.sourceName,
        processedAt: new Date(),
        warnings,
        errors,
        sourceFiles: files,
        stats: {
          locationsProcessed: deduplicatedLocations.length,
          totalFeatures,
          climbingPoints: totalClimbingPoints,
        },
      },
      data: {
        summits: deduplicatedLocations,
      },
    };
  }

  processGeoJsonFile(geoJsonContent, file, dependencies) {
    const warnings = [];
    const errors = [];
    const locations = [];

    if (!geoJsonContent || typeof geoJsonContent !== "string") {
      errors.push({ type: "INVALID_GEOJSON_CONTENT", sourceFile: file });
      return { locations: [], warnings, errors };
    }
    let geoJsonData;
    try {
      geoJsonData = JSON.parse(geoJsonContent);
    } catch (error) {
      errors.push({
        type: "GEOJSON_PARSE_ERROR",
        sourceFile: file,
        message: error.message,
      });
      return { locations: [], warnings, errors };
    }

    if (!geoJsonData.features || !Array.isArray(geoJsonData.features)) {
      errors.push({
        type: "INVALID_GEOJSON_STRUCTURE",
        sourceFile: file,
        message: "features array not found",
      });
      return { locations: [], warnings, errors };
    }

    this.logger.debug(
      `Found ${geoJsonData.features.length} features in ${file}`
    );

    // Combine summit data from dependencies
    const summitData = this.combineDependencies(dependencies, warnings);

    // Filter for climbing points
    const climbingPoints = this.filterClimbingPoints(
      geoJsonData.features,
      warnings
    );
    this.logger.debug(
      `Filtered to ${climbingPoints.length} climbing points from ${file}`
    );

    // Match summits to climbing points
    const matchedLocations = this.matchSummitsToPoints(
      summitData,
      climbingPoints,
      warnings
    );
    locations.push(...matchedLocations);

    return {
      locations,
      warnings,
      errors,
      stats: {
        totalFeatures: geoJsonData.features.length,
        climbingPoints: climbingPoints.length,
      },
    };
  }

  combineDependencies(dependencies, warnings) {
    const summitData = [];

    for (const [depName, depData] of Object.entries(dependencies)) {
      // Skip dependencies that were disabled or failed
      if (!depData) {
        this.logger.debug(`Skipping dependency ${depName} (status: missing)`);
        continue;
      }

      if (depData.data.summits && Array.isArray(depData.data.summits)) {
        summitData.push(...depData.data.summits);
        this.logger.debug(
          `Collected ${depData.data.summits.length} summits from ${depName}`
        );
      } else {
        warnings.push({
          type: "INVALID_DEPENDENCY_DATA",
          dependency: depName,
          message: "does not contain valid summits data",
        });
      }
    }

    this.logger.debug(
      `Total summits collected from dependencies: ${summitData.length}`
    );
    return summitData;
  }

  filterClimbingPoints(features, warnings) {
    const climbingPoints = [];

    features.forEach((feature, index) => {
      // Must be Point geometry
      if (!feature.geometry || feature.geometry.type !== "Point") {
        return;
      }

      // Must have climbing tag in other_tags property
      const props = feature.properties;
      if (!props || !props.other_tags) {
        return;
      }

      // Check if other_tags contains 'climbing'
      if (
        typeof props.other_tags === "string" &&
        props.other_tags.includes("climbing")
      ) {
        // Validate coordinates
        const coords = feature.geometry.coordinates;
        if (
          !Array.isArray(coords) ||
          coords.length !== 2 ||
          typeof coords[0] !== "number" ||
          typeof coords[1] !== "number"
        ) {
          warnings.push({
            type: "INVALID_COORDINATES",
            featureIndex: index,
            coordinates: coords,
          });
          return;
        }

        climbingPoints.push(feature);
      }
    });

    return climbingPoints;
  }

  matchSummitsToPoints(summits, climbingPoints, warnings) {
    // Create a map of climbing point names for faster lookup
    const pointNameMap = new Map();

    climbingPoints.forEach((point, index) => {
      const pointName = point.properties?.name;
      if (!pointName) {
        // Skip points without a name
        this.logger.debug(
          `Skipping climbing point at index ${index} without a name`
        );
        return;
      }

      const coords = point.geometry.coordinates;
      pointNameMap.set(pointName.toLowerCase().trim(), {
        gpsPosition: {
          lng: coords[0],
          lat: coords[1],
        },
        originalPoint: point,
      });
    });

    // Only return summits that have a matching climbing point
    const matchedLocations = [];
    let matchCount = 0;

    summits.forEach((summit, index) => {
      if (!summit.name) {
        warnings.push({
          type: "SUMMIT_WITHOUT_NAME",
          summitIndex: index,
        });
        return;
      }

      const summitName = summit.name.toLowerCase().trim();
      const matchedPoint = pointNameMap.get(summitName);

      if (matchedPoint) {
        this.logger.debug(`Summit match: ${summit.name} -> climbing point`);
        matchCount++;

        // Validate summit data
        const validationResult = this.validateSummitData(
          summit,
          index,
          warnings
        );
        if (validationResult.isValid) {
          // Create clean location object
          const location = {
            name: summit.name.trim(),
            region: summit.region,
            gpsPosition: matchedPoint.gpsPosition,
          };

          matchedLocations.push(location);
        }
      }
    });

    this.logger.debug(`Matched ${matchCount} summits to climbing points`);
    return matchedLocations;
  }

  validateSummitData(summit, index, warnings) {
    let isValid = true;

    if (!summit.name || typeof summit.name !== "string") {
      warnings.push({
        type: "INVALID_SUMMIT_NAME",
        summitIndex: index,
        name: summit.name,
      });
      isValid = false;
    }

    if (summit.region && typeof summit.region !== "string") {
      warnings.push({
        type: "INVALID_SUMMIT_REGION",
        summitIndex: index,
        region: summit.region,
      });
    }

    return { isValid };
  }

  removeDuplicates(locations, warnings) {
    const locationMap = new Map();
    const deduplicatedLocations = [];
    let duplicatesRemoved = 0;

    locations.forEach((location, index) => {
      const locationKey = `${location.name}|${location.region || ""}`;

      if (locationMap.has(locationKey)) {
        warnings.push({
          type: "DUPLICATE_LOCATION_REMOVED",
          name: location.name,
          region: location.region,
          originalIndex: locationMap.get(locationKey),
          duplicateIndex: index,
        });
        duplicatesRemoved++;
      } else {
        locationMap.set(locationKey, index);
        deduplicatedLocations.push(location);
      }
    });

    if (duplicatesRemoved > 0) {
      this.logger.info(`Removed ${duplicatesRemoved} duplicate locations`);
    }

    return deduplicatedLocations;
  }
}

module.exports = OsmLocationsImporter;
