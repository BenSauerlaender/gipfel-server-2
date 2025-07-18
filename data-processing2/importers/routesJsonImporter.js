const fs = require("fs");

class RoutesJsonImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(`Importing routes JSON data from ${files.length} files:`);
    this.logger.debug(`files to import:`, files);

    const allRoutes = [];

    for (const file of files) {
      let fileData;
      try {
        this.logger.info(`Loading JSON file: ${file}`);
        fileData = fs.readFileSync(file, "utf8");
      } catch (error) {
        this.logger.error(`Failed to load JSON file: ${file}`, error);
        errors.push({ type: "FILE_LOADING", sourceFile: file });
        continue;
      }

      const result = this.processJsonFile(fileData, file);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      allRoutes.push(...result.routes);
    }

    // Remove duplicate routes
    const deduplicatedRoutes = this.removeDuplicates(allRoutes, warnings);

    this.logger.info(`Successfully processed ${deduplicatedRoutes.length} routes`);
    if (allRoutes.length > deduplicatedRoutes.length) {
      this.logger.info(`Removed ${allRoutes.length - deduplicatedRoutes.length} duplicate routes`);
    }

    return {
      metadata: {
        sourceName: this.sourceName,
        processedAt: new Date(),
        warnings,
        errors,
        sourceFiles: files,
        stats: {
          routesProcessed: deduplicatedRoutes.length,
        },
      },
      data: {
        routes: deduplicatedRoutes,
      },
    };
  }

  processJsonFile(jsonContent, file) {
    const warnings = [];
    const errors = [];
    const routes = [];

    if (!jsonContent || typeof jsonContent !== "string") {
      errors.push({ type: "INVALID_JSON_CONTENT", sourceFile: file });
      return { routes: [], warnings, errors };
    }

    let routesArray;
    try {
      routesArray = JSON.parse(jsonContent);
    } catch (error) {
      errors.push({
        type: "JSON_PARSE_ERROR",
        sourceFile: file,
        message: error.message,
      });
      return { routes: [], warnings, errors };
    }

    if (!Array.isArray(routesArray)) {
      errors.push({
        type: "INVALID_JSON_STRUCTURE",
        sourceFile: file,
        message: "Routes data must be an array",
        dataType: typeof routesArray,
      });
      return { routes: [], warnings, errors };
    }

    this.logger.debug(`Found ${routesArray.length} routes in ${file}`);

    routesArray.forEach((route, index) => {
      const result = this.validateSingleRoute(route, index, file);
      
      if (result.error) {
        this.logger.debug(`Skipping route ${index}: ${result.error.type}`);
        errors.push({
          ...result.error,
          sourceFile: file,
        });
        return;
      }
      
      if (result.warnings) {
        warnings.push(...result.warnings.map(warning => ({
          ...warning,
          sourceFile: file,
          routeIndex: index,
        })));
      }
      
      if (result.route) {
        routes.push(result.route);
      }
    });

    return { routes, warnings, errors };
  }

  validateSingleRoute(route, index, file) {
    const warnings = [];

    if (typeof route !== "object" || route === null) {
      return {
        error: {
          type: "INVALID_ROUTE_OBJECT",
          routeIndex: index,
          message: "Route must be an object",
        },
      };
    }

    // Validate required fields
    if (typeof route.name !== "string" || route.name.trim().length === 0) {
      return {
        error: {
          type: "MISSING_ROUTE_NAME",
          routeIndex: index,
          message: "Route must have a non-empty name string",
        },
      };
    }

    if (typeof route.summit !== "string" || route.summit.trim().length === 0) {
      return {
        error: {
          type: "MISSING_SUMMIT_NAME",
          routeIndex: index,
          message: "Route must have a non-empty summit string",
        },
      };
    }

    // Validate difficulty object
    if (!route.difficulty || typeof route.difficulty !== "object") {
      return {
        error: {
          type: "MISSING_DIFFICULTY_OBJECT",
          routeIndex: index,
          message: "Route must have a difficulty object",
        },
      };
    }

    const validDifficultyTypes = ["jump", "RP", "normal", "withoutSupport"];
    const presentDifficultyTypes = validDifficultyTypes.filter(
      (type) =>
        route.difficulty[type] && typeof route.difficulty[type] === "string" && route.difficulty[type].trim() !== ""
    );

    if (presentDifficultyTypes.length === 0) {
      return {
        error: {
          type: "NO_VALID_DIFFICULTY",
          routeIndex: index,
          message: `Route must have at least one difficulty type (${validDifficultyTypes.join(", ")})`,
          availableTypes: validDifficultyTypes,
        },
      };
    }

    // Build validated route object
    const validatedRoute = {
      name: route.name.trim(),
      summit: route.summit.trim(),
      difficulty: {},
    };

    // Add present difficulty types
    presentDifficultyTypes.forEach((type) => {
      validatedRoute.difficulty[type] = route.difficulty[type].trim();
    });

    // Add optional fields with validation
    const optionalFieldResult = this.processOptionalFields(route, index);
    if (optionalFieldResult.warnings) {
      warnings.push(...optionalFieldResult.warnings);
    }
    if (optionalFieldResult.error) {
      return { error: optionalFieldResult.error };
    }

    // Add validated optional fields
    Object.assign(validatedRoute, optionalFieldResult.fields);

    return { 
      route: validatedRoute,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  processOptionalFields(route, index) {
    const warnings = [];
    const fields = {};

    // Process teufelsturmId
    if (route.teufelsturmId !== undefined && route.teufelsturmId !== null) {
      const teufelsturmId = typeof route.teufelsturmId === "string" 
        ? route.teufelsturmId.trim() 
        : String(route.teufelsturmId);
      
      if (teufelsturmId !== "") {
        fields.teufelsturmId = teufelsturmId;
      }
    }

    // Process teufelsturmScore
    if (route.teufelsturmScore !== undefined && route.teufelsturmScore !== null) {
      let score = typeof route.teufelsturmScore === "string" 
        ? route.teufelsturmScore.trim() 
        : String(route.teufelsturmScore);

      if (score !== "") {
        if (!this.isValidTeufelsturmScore(score)) {
          return {
            error: {
              type: "INVALID_TEUFELSTURM_SCORE",
              routeIndex: index,
              message: `Invalid teufelsturmScore: ${score} (must be -3 to 3 or empty)`,
              invalidScore: score,
            },
          };
        }
        fields.teufelsturmScore = score;
      }
    }

    // Process unsecure flag
    if (route.unsecure !== undefined && route.unsecure !== null) {
      fields.unsecure = Boolean(route.unsecure);
    }

    // Process stars
    if (route.stars !== undefined && route.stars !== null) {
      const stars = Number(route.stars);
      if (!Number.isInteger(stars) || stars < 0 || stars > 2) {
        return {
          error: {
            type: "INVALID_STARS_VALUE",
            routeIndex: index,
            message: `Invalid stars value: ${route.stars} (must be 0, 1, or 2)`,
            invalidStars: route.stars,
          },
        };
      }
      fields.stars = stars;
    }

    // Process region (optional field that might be present)
    if (route.region !== undefined && route.region !== null) {
      if (typeof route.region === "string" && route.region.trim() !== "") {
        fields.region = route.region.trim();
      } else {
        warnings.push({
          type: "INVALID_REGION_VALUE",
          message: `Invalid region value: ${route.region}`,
          invalidRegion: route.region,
        });
      }
    }

    return { fields, warnings: warnings.length > 0 ? warnings : undefined };
  }

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

  removeDuplicates(routes, warnings) {
    const routeMap = new Map();
    const deduplicatedRoutes = [];
    let duplicatesRemoved = 0;

    routes.forEach((route, index) => {
      const routeKey = `${route.name}|${route.summit}`.toLowerCase();
      
      if (routeMap.has(routeKey)) {
        warnings.push({
          type: "DUPLICATE_ROUTE_REMOVED",
          name: route.name,
          summit: route.summit,
          originalIndex: routeMap.get(routeKey),
          duplicateIndex: index,
        });
        duplicatesRemoved++;
      } else {
        routeMap.set(routeKey, index);
        deduplicatedRoutes.push(route);
      }
    });

    if (duplicatesRemoved > 0) {
      this.logger.info(`Removed ${duplicatesRemoved} duplicate routes`);
    }

    return deduplicatedRoutes;
  }
}

module.exports = RoutesJsonImporter;
