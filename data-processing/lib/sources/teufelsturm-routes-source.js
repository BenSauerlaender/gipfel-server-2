const fs = require("fs").promises;
const cheerio = require("cheerio");
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const ErrorHandler = require("../core/error-handler");
const fixSummitName = require("../util/fixSummitName");

/**
 * Teufelsturm routes data source handler
 * Processes HTML files from Teufelsturm website to extract climbing route data
 */
class TeufelsturmRoutesSource extends BaseSource {
  constructor(config, logger, cache = null) {
    super(config, logger, cache);

    // Validate that input files are configured
    if (!config.inputFile && !config.inputFiles) {
      throw new ProcessingError(
        "TeufelsturmRoutesSource requires either inputFile or inputFiles to be configured",
        ProcessingError.Categories.CONFIG_ERROR,
        this.sourceName,
        { config }
      );
    }

    // Always use inputFiles array, wrap single file if needed
    this.inputFiles = config.inputFiles || [config.inputFile];

    // Difficulty scales and mappings from original script
    this.JUMP_SCALA = ["1", "2", "3", "4", "5"];
    this.SCALA = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VIIa",
      "VIIb",
      "VIIc",
      "VIIIa",
      "VIIIb",
      "VIIIc",
      "IXa",
      "IXb",
      "IXc",
      "Xa",
      "Xb",
      "Xc",
      "XIa",
      "XIb",
      "XIc",
      "XIIa",
      "XIIb",
      "XIIc",
    ];
    this.scoreMap = {
      "arrow-downright": "-1",
      "arrow-downright2": "-2",
      "arrow-downright3": "-3",
      "arrow-right": "0",
      "arrow-upright": "1",
      "arrow-upright2": "2",
      "arrow-upright3": "3",
    };
  }

  /**
   * Fetch HTML content from configured input files
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Array>} Array of {filePath, content} objects
   */
  async fetch(dependencies = {}) {
    this.logProgress("fetch", "Loading HTML files");

    const results = [];

    for (const filePath of this.inputFiles) {
      try {
        this.logger.debug(`Reading file: ${filePath}`);
        const content = await fs.readFile(filePath, "utf8");
        results.push({ filePath, content });
      } catch (error) {
        if (error.code === "ENOENT") {
          this.logger.warn(`File not found: ${filePath}`);
          continue;
        }
        throw ErrorHandler.wrapError(
          error,
          ProcessingError.Categories.SOURCE_ERROR,
          this.sourceName,
          { filePath }
        );
      }
    }

    if (results.length === 0) {
      throw new ProcessingError(
        "No HTML files could be loaded",
        ProcessingError.Categories.SOURCE_ERROR,
        this.sourceName,
        { inputFiles: this.inputFiles }
      );
    }

    this.logProgress("fetch", `Loaded ${results.length} HTML files`);
    return results;
  }

  /**
   * Parse HTML content to extract route data
   * @param {Array} htmlFiles - Array of {filePath, content} objects
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Object>} Parsed route data with regions, summits, and routes
   */
  async parse(htmlFiles, dependencies = {}) {
    this.logProgress("parse", "Parsing HTML content");

    let allRoutes = [];
    let totalProcessed = 0;

    for (const { filePath, content } of htmlFiles) {
      try {
        this.logger.debug(`Processing file: ${filePath}`);
        const routes = await this.processHtmlFile(content);
        allRoutes = allRoutes.concat(routes);
        totalProcessed += routes.length;
        this.logger.debug(`Extracted ${routes.length} routes from ${filePath}`);
      } catch (error) {
        throw new ProcessingError(
          `Failed to parse HTML file ${filePath}: ${error.message}`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { filePath, error: error.message }
        );
      }
    }

    // Extract unique regions, summits, and routes
    const uniqueRegions = this.extractUniqueRegions(allRoutes);
    const uniqueSummits = this.extractUniqueSummits(allRoutes);
    const uniqueRoutes = this.extractUniqueRoutes(allRoutes);

    const result = {
      regions: uniqueRegions,
      summits: uniqueSummits,
      routes: uniqueRoutes,
      metadata: {
        totalProcessed,
        processedAt: new Date(),
        sourceFiles: htmlFiles.map((f) => f.filePath),
      },
    };

    this.logProgress(
      "parse",
      `Extracted ${uniqueRegions.length} regions, ${uniqueSummits.length} summits, ${uniqueRoutes.length} routes`
    );
    return result;
  }

  /**
   * Process a single HTML file to extract route data
   * @param {string} htmlContent - HTML content
   * @returns {Promise<Array>} Array of route objects
   */
  async processHtmlFile(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const routes = [];

    // Find all table rows containing route data
    // Based on the HTML structure: table rows with route information
    $("tr").each((idx, element) => {
      try {
        const $row = $(element);
        const cells = $row.find("td");

        // Skip rows that don't have the expected number of cells
        if (cells.length < 6) {
          return;
        }

        // Extract data from each cell
        const summitCell = cells.eq(1);
        const routeCell = cells.eq(2);
        const scoreCell = cells.eq(3);
        const difficultyCell = cells.eq(4);
        const regionCell = cells.eq(5);

        // Extract summit name
        const summitText = summitCell.text().trim();
        if (!summitText) {
          return;
        }

        // Extract route name and teufelsturmId
        const routeLink = routeCell.find("a");
        const routeName = routeLink.text().trim();
        if (!routeName) {
          return;
        }

        // Extract teufelsturmId from URL parameter 'wegnr'
        let teufelsturmId = null;
        const href = routeLink.attr("href");
        if (href) {
          const match = href.match(/wegnr=(\d+)/);
          if (match) {
            teufelsturmId = match[1];
          }
        }

        // Extract teufelsturm score from image
        let teufelsturmScore = null;
        const scoreImg = scoreCell.find("img");
        if (scoreImg.length > 0) {
          const src = scoreImg.attr("src");
          if (src) {
            const imageName = src.split("/").pop().split(".")[0];
            teufelsturmScore = this.scoreMap[imageName] || null;
          }
        }

        // Extract difficulty
        const difficultyText = difficultyCell.text().trim();
        if (!difficultyText) {
          return;
        }

        // Extract region
        const regionText = regionCell.text().trim();
        if (!regionText) {
          return;
        }

        // Only process rows with all required data
        if (teufelsturmId && teufelsturmScore !== null) {
          const route = {
            name: routeName,
            summit: fixSummitName(summitText),
            region: regionText,
            teufelsturmId: teufelsturmId,
            teufelsturmScore: teufelsturmScore,
            ...this.resolveDifficulty(difficultyText),
          };

          routes.push(route);
        } else {
          // Log routes that are skipped due to missing data
          this.logger.debug(
            `Skipping route due to missing data: ${routeName} at ${summitText} - teufelsturmId: ${teufelsturmId}, teufelsturmScore: ${teufelsturmScore}`
          );
        }
      } catch (error) {
        this.logger.warn(`Error processing row ${idx}:`, error.message);
      }
    });

    return routes;
  }

  /**
   * Resolve difficulty string into structured difficulty object
   * @param {string} difficultyString - Raw difficulty string
   * @returns {Object} Structured difficulty object
   */
  resolveDifficulty(difficultyString) {
    const result = {
      unsecure: false,
      stars: 0,
      difficulty: {
        jump: undefined,
        RP: undefined,
        normal: undefined,
        withoutSupport: undefined,
      },
    };

    const symbols = difficultyString.split(/[\s\/]+/);
    let symbol = symbols.shift();

    while (symbol !== undefined) {
      if (symbol === "!") {
        result.unsecure = true;
      } else if (symbol === "*") {
        result.stars = 1;
      } else if (symbol === "**") {
        result.stars = 2;
      } else if (this.SCALA.includes(symbol)) {
        result.difficulty.normal = symbol;
      } else if (this.JUMP_SCALA.includes(symbol)) {
        result.difficulty.jump = symbol;
      } else if (this.SCALA.map((s) => `(${s})`).includes(symbol)) {
        result.difficulty.withoutSupport = symbol.slice(1, -1);
      } else if (symbol === "RP") {
        symbol = symbols.shift();
        if (this.SCALA.includes(symbol)) {
          result.difficulty.RP = symbol;
        } else {
          this.logger.warn(`Symbol ${symbol} is not a valid RP difficulty`);
        }
      } else {
        this.logger.debug(`Symbol ${symbol} cannot be processed`);
      }

      symbol = symbols.shift();
    }

    if (
      !result.difficulty.jump &&
      !result.difficulty.withoutSupport &&
      !result.difficulty.RP &&
      !result.difficulty.normal
    ) {
      this.logger.warn(`No difficulty found in: ${difficultyString}`);
    }

    return result;
  }

  /**
   * Extract unique regions from route data
   * @param {Array} routes - Array of route objects
   * @returns {Array} Array of unique region objects
   */
  extractUniqueRegions(routes) {
    return routes.reduce((acc, route) => {
      if (!acc.some((r) => r.name === route.region)) {
        acc.push({ name: route.region });
      }
      return acc;
    }, []);
  }

  /**
   * Extract unique summits from route data
   * @param {Array} routes - Array of route objects
   * @returns {Array} Array of unique summit objects
   */
  extractUniqueSummits(routes) {
    return routes.reduce((acc, route) => {
      if (
        !acc.some((s) => s.name === route.summit && s.region === route.region)
      ) {
        acc.push({
          name: route.summit,
          region: route.region,
          teufelsturmId: undefined,
        });
      }
      return acc;
    }, []);
  }

  /**
   * Extract unique routes from route data
   * @param {Array} routes - Array of route objects
   * @returns {Array} Array of unique route objects
   */
  extractUniqueRoutes(routes) {
    return routes.reduce((acc, route) => {
      const existing = acc.find(
        (r) =>
          r.name === route.name &&
          r.summit === route.summit &&
          r.region === route.region
      );

      if (!existing) {
        acc.push({
          name: route.name,
          summit: route.summit,
          region: route.region,
          teufelsturmId: route.teufelsturmId,
          teufelsturmScore: route.teufelsturmScore,
          difficulty: route.difficulty,
          unsecure: route.unsecure,
          stars: route.stars,
        });
      } else {
        this.logger.debug(
          `Duplicate route found: ${route.name} at summit ${route.summit} in region ${route.region}`
        );
      }

      return acc;
    }, []);
  }

  /**
   * Validate parsed data
   * @param {Object} parsedData - Parsed data object
   * @returns {Promise<Object>} Validated data
   */
  async validate(parsedData) {
    await super.validate(parsedData);

    this.logProgress("validate", "Validating parsed data structure");

    // Validate structure
    if (!parsedData.regions || !Array.isArray(parsedData.regions)) {
      throw new ProcessingError(
        "Invalid data structure: regions must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    if (!parsedData.summits || !Array.isArray(parsedData.summits)) {
      throw new ProcessingError(
        "Invalid data structure: summits must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    if (!parsedData.routes || !Array.isArray(parsedData.routes)) {
      throw new ProcessingError(
        "Invalid data structure: routes must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    // Validate data quality
    const routesWithoutId = parsedData.routes.filter((r) => !r.teufelsturmId);
    if (routesWithoutId.length > 0) {
      this.logger.warn(
        `${routesWithoutId.length} routes missing teufelsturmId`
      );
    }

    const routesWithoutScore = parsedData.routes.filter(
      (r) => r.teufelsturmScore === null || r.teufelsturmScore === undefined
    );
    if (routesWithoutScore.length > 0) {
      this.logger.warn(
        `${routesWithoutScore.length} routes missing teufelsturmScore`
      );
    }

    // Validate individual routes and collect only valid ones
    const validatedRoutes = [];
    const errors = [];
    const warnings = [];

    this.logProgress(
      "validate",
      `Validating ${parsedData.routes.length} routes`
    );

    for (let i = 0; i < parsedData.routes.length; i++) {
      const route = parsedData.routes[i];
      const routeIdentifier = `${route.name} at ${route.summit} (${route.region})`;

      try {
        // Validate that route has at least one difficulty set
        const hasDifficulty = this.validateRouteDifficulty(
          route,
          routeIdentifier
        );
        if (!hasDifficulty) {
          errors.push({
            index: i,
            route: routeIdentifier,
            error: "Route must have at least one difficulty set",
            teufelsturmId: route.teufelsturmId,
            data: route,
          });
          continue; // Skip invalid route
        }

        // Validate that set difficulties are in valid scales
        const routeWarnings = [];
        this.validateDifficultyValues(route, routeIdentifier, routeWarnings);
        warnings.push(...routeWarnings);

        // Route is valid, add to validated routes
        validatedRoutes.push(route);
      } catch (error) {
        errors.push({
          index: i,
          route: routeIdentifier,
          error: error.message,
          teufelsturmId: route.teufelsturmId,
          data: route,
        });
      }
    }

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} invalid routes (excluded from results)`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(`Validation found ${warnings.length} route warnings`, {
        warnings,
      });
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedRoutes.length} routes (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      regions: parsedData.regions,
      summits: parsedData.summits,
      routes: validatedRoutes, // Only valid routes
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
   * Validate that a route has at least one difficulty set
   * @param {Object} route - Route object to validate
   * @param {string} routeIdentifier - Route identifier for error reporting
   * @returns {boolean} True if route has at least one difficulty set
   */
  validateRouteDifficulty(route, routeIdentifier) {
    const difficulty = route.difficulty;

    if (!difficulty || typeof difficulty !== "object") {
      return false;
    }

    // Check if at least one difficulty type is set
    const hasDifficulty = !!(
      difficulty.jump ||
      difficulty.RP ||
      difficulty.normal ||
      difficulty.withoutSupport
    );

    return hasDifficulty;
  }

  /**
   * Validate that set difficulty values are in valid scales
   * @param {Object} route - Route object to validate
   * @param {string} routeIdentifier - Route identifier for error reporting
   * @param {Array} validationWarnings - Array to collect warnings
   */
  validateDifficultyValues(route, routeIdentifier, validationWarnings) {
    const difficulty = route.difficulty;

    if (!difficulty || typeof difficulty !== "object") {
      return;
    }

    // Validate jump difficulty
    if (difficulty.jump && !this.JUMP_SCALA.includes(difficulty.jump)) {
      validationWarnings.push({
        route: routeIdentifier,
        warning: `Invalid jump difficulty '${difficulty.jump}', must be one of: ${this.JUMP_SCALA.join(", ")}`,
        teufelsturmId: route.teufelsturmId,
      });
    }

    // Validate normal difficulty
    if (difficulty.normal && !this.SCALA.includes(difficulty.normal)) {
      validationWarnings.push({
        route: routeIdentifier,
        warning: `Invalid normal difficulty '${difficulty.normal}', must be one of: ${this.SCALA.join(", ")}`,
        teufelsturmId: route.teufelsturmId,
      });
    }

    // Validate RP difficulty
    if (difficulty.RP && !this.SCALA.includes(difficulty.RP)) {
      validationWarnings.push({
        route: routeIdentifier,
        warning: `Invalid RP difficulty '${difficulty.RP}', must be one of: ${this.SCALA.join(", ")}`,
        teufelsturmId: route.teufelsturmId,
      });
    }

    // Validate withoutSupport difficulty
    if (
      difficulty.withoutSupport &&
      !this.SCALA.includes(difficulty.withoutSupport)
    ) {
      validationWarnings.push({
        route: routeIdentifier,
        warning: `Invalid withoutSupport difficulty '${difficulty.withoutSupport}', must be one of: ${this.SCALA.join(", ")}`,
        teufelsturmId: route.teufelsturmId,
      });
    }
  }

  /**
   * Get source files that this processor depends on
   * @returns {Array} Array of source file paths
   */
  getSourceFiles() {
    return this.inputFiles;
  }
}

module.exports = TeufelsturmRoutesSource;
