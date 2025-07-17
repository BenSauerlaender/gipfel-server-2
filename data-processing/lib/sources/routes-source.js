const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const ErrorHandler = require("../core/error-handler");

/**
 * Routes data source handler
 * Processes routes data from JSON file with caching support
 */
class RoutesSource extends BaseSource {
  constructor(config, logger, cache = null) {
    super(config, logger, cache);

    // Validate that input files are configured
    if (!config.inputFile && !config.inputFiles) {
      throw new ProcessingError(
        "RoutesSource requires either inputFile or inputFiles to be configured",
        ProcessingError.Categories.CONFIG_ERROR,
        this.sourceName,
        { config }
      );
    }

    // Always use inputFiles array, wrap single file if needed
    this.inputFiles = config.inputFiles || [config.inputFile];
  }

  /**
   * Fetch raw routes data from JSON files
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Array>} Array of file data objects
   * @throws {ProcessingError} When file cannot be read
   */
  async fetch(dependencies = {}) {
    this.logProgress(
      "fetch",
      `Reading routes data from ${this.inputFiles.length} files`
    );

    const fileDataArray = [];
    for (let i = 0; i < this.inputFiles.length; i++) {
      const filePath = this.inputFiles[i];
      try {
        const rawData = await fs.readFile(filePath, "utf8");
        fileDataArray.push({
          filePath,
          rawData,
          index: i,
        });
        this.logProgress(
          "fetch",
          `Successfully read ${rawData.length} characters from ${filePath}`
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
   * Parse raw JSON data into structured routes object with metadata
   * @param {Array} fileDataArray - Array of file data objects
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Object>} Object with routes array and metadata
   * @throws {ProcessingError} When JSON parsing fails
   */
  async parse(fileDataArray, dependencies = {}) {
    this.logProgress("parse", "Parsing routes JSON data");

    try {
      const allRoutes = [];
      const sourceFiles = [];

      for (const fileData of fileDataArray) {
        const { filePath, rawData } = fileData;
        sourceFiles.push(filePath);

        const routesArray = JSON.parse(rawData);

        if (!Array.isArray(routesArray)) {
          throw ErrorHandler.createError(
            `Routes data in ${filePath} must be an array`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            { filePath, dataType: typeof routesArray }
          );
        }

        allRoutes.push(...routesArray);
      }

      const result = {
        routes: allRoutes,
        metadata: {
          totalProcessed: allRoutes.length,
          processedAt: new Date(),
          sourceFiles: sourceFiles,
        },
      };

      this.logProgress(
        "parse",
        `Successfully parsed ${allRoutes.length} routes from ${fileDataArray.length} files`
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
   * Validate parsed routes data
   * @param {Object} parsedData - Object with routes array and metadata
   * @returns {Promise<Object>} Validated routes data with metadata
   * @throws {ProcessingError} When validation fails
   */
  async validate(parsedData) {
    // Call parent validation first (handles null/undefined)
    await super.validate(parsedData);

    // Validate structure
    if (!parsedData.routes || !Array.isArray(parsedData.routes)) {
      throw new ProcessingError(
        "Invalid data structure: routes must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { dataType: typeof parsedData.routes }
      );
    }

    if (!parsedData.metadata || typeof parsedData.metadata !== "object") {
      throw new ProcessingError(
        "Invalid data structure: metadata must be an object",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { dataType: typeof parsedData.metadata }
      );
    }

    this.logProgress(
      "validate",
      `Validating ${parsedData.routes.length} routes`
    );

    const validatedRoutes = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < parsedData.routes.length; i++) {
      const route = parsedData.routes[i];

      try {
        const validatedRoute = await this.validateSingleRoute(route, i);
        validatedRoutes.push(validatedRoute);
      } catch (error) {
        if (error instanceof ProcessingError) {
          errors.push({
            index: i,
            route: route,
            error: error.message,
          });
        } else {
          errors.push({
            index: i,
            route: route,
            error: `Unexpected validation error: ${error.message}`,
          });
        }
      }
    }

    // Check for duplicate routes (same name + summit combination)
    const routeMap = new Map();
    validatedRoutes.forEach((route, index) => {
      const routeKey = `${route.name}@${route.summit}`.toLowerCase();
      if (routeMap.has(routeKey)) {
        warnings.push({
          type: "duplicate_route",
          message: `Duplicate route found: "${route.name}" on "${route.summit}"`,
          indices: [routeMap.get(routeKey), index],
        });
      } else {
        routeMap.set(routeKey, index);
      }
    });

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} errors in routes data`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `Validation found ${warnings.length} warnings in routes data`,
        { warnings }
      );
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedRoutes.length} routes (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      routes: validatedRoutes,
      metadata: {
        ...parsedData.metadata,
        validatedAt: new Date(),
        validationResults: {
          totalValidated: validatedRoutes.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      },
    };
  }

  /**
   * Validate a single route object
   * @param {Object} route - Route object to validate
   * @param {number} index - Index in the array for error reporting
   * @returns {Promise<Object>} Validated route object
   * @throws {ProcessingError} When validation fails
   */
  async validateSingleRoute(route, index) {
    if (typeof route !== "object" || route === null) {
      throw new ProcessingError(
        `Route at index ${index} must be an object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, route: route }
      );
    }

    // Validate required fields
    if (typeof route.name !== "string" || route.name.trim().length === 0) {
      throw new ProcessingError(
        `Route at index ${index} must have a non-empty name string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, route: route }
      );
    }

    if (typeof route.summit !== "string" || route.summit.trim().length === 0) {
      throw new ProcessingError(
        `Route at index ${index} must have a non-empty summit string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, route: route }
      );
    }

    // Validate difficulty object - at least one difficulty type must be present
    if (!route.difficulty || typeof route.difficulty !== "object") {
      throw new ProcessingError(
        `Route at index ${index} must have a difficulty object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, route: route }
      );
    }

    const validDifficultyTypes = ["jump", "RP", "normal", "withoutSupport"];
    const presentDifficultyTypes = validDifficultyTypes.filter(
      (type) =>
        route.difficulty[type] && typeof route.difficulty[type] === "string"
    );

    if (presentDifficultyTypes.length === 0) {
      throw new ProcessingError(
        `Route at index ${index} must have at least one difficulty type (${validDifficultyTypes.join(", ")})`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, route: route, availableTypes: validDifficultyTypes }
      );
    }

    // Build validated route object
    const validatedRoute = {
      name: route.name.trim(),
      summit: route.summit.trim(),
      difficulty: {},
    };

    // Add present difficulty types, filtering out empty values
    presentDifficultyTypes.forEach((type) => {
      const difficultyValue = route.difficulty[type].trim();
      if (difficultyValue !== "") {
        validatedRoute.difficulty[type] = difficultyValue;
      }
    });

    // Add optional fields if present and not empty/null/undefined
    if (route.teufelsturmId !== undefined && route.teufelsturmId !== null) {
      const teufelsturmId =
        typeof route.teufelsturmId === "string"
          ? route.teufelsturmId.trim()
          : String(route.teufelsturmId);
      if (teufelsturmId !== "") {
        validatedRoute.teufelsturmId = teufelsturmId;
      }
    }

    if (
      route.teufelsturmScore !== undefined &&
      route.teufelsturmScore !== null
    ) {
      let score;
      if (typeof route.teufelsturmScore === "string") {
        score = route.teufelsturmScore.trim();
      } else {
        score = String(route.teufelsturmScore);
      }

      if (score !== "") {
        // Validate score range if not empty
        if (!this.isValidTeufelsturmScore(score)) {
          throw new ProcessingError(
            `Route at index ${index} has invalid teufelsturmScore: ${score} (must be -3 to 3 or empty)`,
            ProcessingError.Categories.VALIDATION_ERROR,
            this.sourceName,
            { index, route: route, invalidScore: score }
          );
        }
        validatedRoute.teufelsturmScore = score;
      }
    }

    if (route.unsecure !== undefined && route.unsecure !== null) {
      validatedRoute.unsecure = Boolean(route.unsecure);
    }

    if (route.stars !== undefined && route.stars !== null) {
      const stars = Number(route.stars);
      if (!Number.isInteger(stars) || stars < 0 || stars > 2) {
        throw new ProcessingError(
          `Route at index ${index} has invalid stars value: ${route.stars} (must be 0, 1, or 2)`,
          ProcessingError.Categories.VALIDATION_ERROR,
          this.sourceName,
          { index, route: route, invalidStars: route.stars }
        );
      }
      validatedRoute.stars = stars;
    }

    return validatedRoute;
  }

  /**
   * Validate teufelsturmScore value
   * @param {string} score - Score to validate
   * @returns {boolean} True if valid score
   */
  isValidTeufelsturmScore(score) {
    // Empty string is valid
    if (score === "") {
      return true;
    }

    const numScore = parseInt(score, 10);
    // Check if it's a valid integer and the string representation matches (no decimals)
    return (
      !isNaN(numScore) &&
      String(numScore) === score &&
      numScore >= -3 &&
      numScore <= 3
    );
  }

  /**
   * Get source files that this processor depends on
   * @returns {string[]} Array of source file paths
   */
  getSourceFiles() {
    return this.inputFiles;
  }
}

module.exports = RoutesSource;
