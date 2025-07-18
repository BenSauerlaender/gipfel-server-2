const fs = require("fs");
const cheerio = require("cheerio");

class TeufelsturmRoutesImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(
      `Importing Teufelsturm routes from ${files.length} HTML files:`
    );
    this.logger.debug(`files to import:`, files);

    const allRoutes = [];

    for (const file of files) {
      let fileData;
      try {
        this.logger.info(`Loading HTML file: ${file}`);
        fileData = fs.readFileSync(file, "utf8");
      } catch (error) {
        this.logger.error(`Failed to load HTML file: ${file}`, error);
        errors.push({ type: "FILE_LOADING", sourceFile: file });
        continue;
      }

      const result = this.processHtmlFile(fileData, file);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      allRoutes.push(...result.routes);
    }

    // Remove duplicate routes
    const deduplicatedRoutes = this.removeDuplicates(allRoutes, errors);

    // Count and log filtered routes
    const totalProcessed = allRoutes.length;
    const duplicatesRemoved = totalProcessed - deduplicatedRoutes.length;
    const routesWithMissingDifficulty = errors.filter(
      (e) => e.type === "NO_VALID_DIFFICULTY"
    ).length;

    this.logger.info(
      `Successfully processed ${deduplicatedRoutes.length} routes`
    );
    if (duplicatesRemoved > 0) {
      this.logger.info(`Removed ${duplicatesRemoved} duplicate routes`);
    }
    if (routesWithMissingDifficulty > 0) {
      this.logger.info(
        `Filtered out ${routesWithMissingDifficulty} routes with no valid difficulty`
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
          routesProcessed: deduplicatedRoutes.length,
        },
      },
      data: {
        routes: deduplicatedRoutes,
      },
    };
  }

  processHtmlFile(htmlContent, file) {
    const warnings = [];
    const errors = [];
    const routes = [];

    if (!htmlContent || typeof htmlContent !== "string") {
      errors.push({ type: "INVALID_HTML_CONTENT", sourceFile: file });
      return { routes: [], warnings, errors };
    }

    try {
      const $ = cheerio.load(htmlContent);
      const rows = $(
        "body:nth-child(2) tbody tr td:nth-child(2) table tbody tr td div table tbody tr"
      ).toArray();

      this.logger.debug(`Found ${rows.length} route rows in ${file}`);

      rows.forEach((row, index) => {
        const result = this.processRouteRow($, row, file, index);

        if (result.error) {
          this.logger.debug(`Skipping row ${index}: ${result.error.type}`);
          errors.push({
            ...result.error,
            sourceFile: file,
          });
          return;
        }

        if (result.warnings) {
          warnings.push(...result.warnings);
        }

        if (result.route) {
          routes.push(result.route);
        }
      });
    } catch (error) {
      this.logger.error(`Failed to parse HTML content in ${file}`, error);
      errors.push({
        type: "HTML_PARSING_ERROR",
        sourceFile: file,
        message: error.message,
      });
    }

    return { routes, warnings, errors };
  }

  processRouteRow($, row, file, rowIndex) {
    try {
      // Extract summit from column 1 (0-indexed)
      const summitResult = this.extractSummit($, row, rowIndex);
      if (summitResult.error) return summitResult;

      // Extract route name and teufelsturmId from column 2
      const routeResult = this.extractRoute($, row, rowIndex);
      if (routeResult.error) return routeResult;

      // Extract teufelsturm score from column 3
      const scoreResult = this.extractScore($, row, rowIndex);
      if (scoreResult.error) return scoreResult;

      // Extract difficulty from column 4
      const difficultyResult = this.extractDifficulty($, row, rowIndex);
      if (difficultyResult.error) return difficultyResult;

      // Extract region from column 5
      const regionResult = this.extractRegion($, row, rowIndex);
      if (regionResult.error) return regionResult;

      const route = {
        name: routeResult.route.name,
        summit: summitResult.summit,
        region: regionResult.region,
        teufelsturmId: routeResult.route.teufelsturmId,
        teufelsturmScore: scoreResult.score,
        ...difficultyResult.difficulty,
      };

      // Return route with any difficulty warnings
      const result = { route };
      if (difficultyResult.warnings && difficultyResult.warnings.length > 0) {
        result.warnings = difficultyResult.warnings.map((warning) => ({
          ...warning,
          rowIndex,
          routeName: route.name,
          summit: route.summit,
        }));
      }

      return result;
    } catch (error) {
      return {
        error: {
          type: "ROW_PROCESSING_ERROR",
          sourceFile: file,
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  extractSummit($, row, rowIndex) {
    try {
      const summitElement = $(row.children[1])
        .find("*")
        .contents()
        .filter(function () {
          return this.type === "text";
        })
        .first();

      if (!summitElement.length) {
        return { error: { type: "SUMMIT_NOT_FOUND", rowIndex } };
      }

      const summitName = summitElement.text().trim();
      if (!summitName) {
        return { error: { type: "EMPTY_SUMMIT_NAME", rowIndex } };
      }

      return { summit: this.fixSummitName(summitName) };
    } catch (error) {
      return {
        error: {
          type: "SUMMIT_EXTRACTION_ERROR",
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  extractRoute($, row, rowIndex) {
    try {
      const routeLink = $(row.children[2]).find('a[href*="wegnr="]');

      if (!routeLink.length) {
        return {
          error: {
            type: "ROUTE_LINK_NOT_FOUND",
            rowIndex,
          },
        };
      }

      const routeName = routeLink.text().trim();
      if (!routeName) {
        return { error: { type: "EMPTY_ROUTE_NAME", rowIndex } };
      }

      // Extract teufelsturmId
      const href = routeLink.attr("href");
      const teufelsturmId = this.extractTeufelsturmId(href);

      return {
        route: {
          name: routeName,
          teufelsturmId: teufelsturmId,
        },
      };
    } catch (error) {
      return {
        error: {
          type: "ROUTE_EXTRACTION_ERROR",
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  extractScore($, row, rowIndex) {
    try {
      const scoreImg = $(row.children[3]).find("img");

      if (!scoreImg.length) {
        return { error: { type: "SCORE_IMAGE_NOT_FOUND", rowIndex } };
      }

      const imgSrc = scoreImg.attr("src");
      if (!imgSrc) {
        return { error: { type: "SCORE_IMAGE_SRC_MISSING", rowIndex } };
      }

      const score = this.mapScore(imgSrc);
      if (score === undefined) {
        return { error: { type: "SCORE_MAPPING_FAILED", rowIndex, imgSrc } };
      }

      return { score };
    } catch (error) {
      return {
        error: {
          type: "SCORE_EXTRACTION_ERROR",
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  extractDifficulty($, row, rowIndex) {
    try {
      const difficultyElement = $(row.children[4])
        .find("*")
        .contents()
        .filter(function () {
          return this.type === "text";
        })
        .first();

      if (!difficultyElement.length) {
        return { error: { type: "DIFFICULTY_NOT_FOUND", rowIndex } };
      }

      const difficultyText = difficultyElement.text().trim();
      if (!difficultyText) {
        return { error: { type: "EMPTY_DIFFICULTY", rowIndex } };
      }

      const { result, warnings } = this.resolveDifficulty(difficultyText);

      // Check if any valid difficulty was found
      const hasValidDifficulty =
        result.difficulty.jump !== undefined ||
        result.difficulty.RP !== undefined ||
        result.difficulty.normal !== undefined ||
        result.difficulty.withoutSupport !== undefined;

      if (!hasValidDifficulty) {
        return {
          error: {
            type: "NO_VALID_DIFFICULTY",
            rowIndex,
            originalText: difficultyText,
          },
        };
      }

      return { difficulty: result, warnings };
    } catch (error) {
      return {
        error: {
          type: "DIFFICULTY_EXTRACTION_ERROR",
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  extractRegion($, row, rowIndex) {
    try {
      const regionElement = $(row.children[5])
        .find("*")
        .contents()
        .filter(function () {
          return this.type === "text";
        })
        .first();

      if (!regionElement.length) {
        return { error: { type: "REGION_NOT_FOUND", rowIndex } };
      }

      const regionName = regionElement.text().trim();
      if (!regionName) {
        return { error: { type: "EMPTY_REGION_NAME", rowIndex } };
      }

      return { region: regionName };
    } catch (error) {
      return {
        error: {
          type: "REGION_EXTRACTION_ERROR",
          rowIndex,
          message: error.message,
        },
      };
    }
  }

  fixSummitName(name) {
    if (name.includes(",")) {
      const parts = name.split(",").map((s) => s.trim());
      if (parts.length === 2) {
        return `${parts[1]} ${parts[0]}`;
      }
    }
    return name;
  }

  extractTeufelsturmId(href) {
    if (!href) return null;

    const match = href.match(/wegnr=(\d+)/);
    return match ? match[1] : null;
  }

  mapScore(imgSrc) {
    const scoreMap = {
      "arrow-downright": "-1",
      "arrow-downright2": "-2",
      "arrow-downright3": "-3",
      "arrow-right": "0",
      "arrow-upright": "1",
      "arrow-upright2": "2",
      "arrow-upright3": "3",
    };

    const fileName = imgSrc.split("/").pop().split(".")[0];
    return scoreMap[fileName];
  }

  resolveDifficulty(difficultyString) {
    const JUMP_SCALA = ["1", "2", "3", "4", "5"];
    const SCALA = [
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

    const warnings = [];
    const symbols = difficultyString.split(/[\s\/]+/);
    let i = 0;

    while (i < symbols.length) {
      const symbol = symbols[i];

      if (symbol === "!") {
        result.unsecure = true;
      } else if (symbol === "*") {
        result.stars = 1;
      } else if (symbol === "**") {
        result.stars = 2;
      } else if (SCALA.includes(symbol)) {
        result.difficulty.normal = symbol;
      } else if (JUMP_SCALA.includes(symbol)) {
        result.difficulty.jump = symbol;
      } else if (symbol.startsWith("(") && symbol.endsWith(")")) {
        const innerSymbol = symbol.slice(1, -1);
        if (SCALA.includes(innerSymbol)) {
          result.difficulty.withoutSupport = innerSymbol;
        } else {
          warnings.push({
            type: "UNKNOWN_DIFFICULTY_SYMBOL",
            symbol: innerSymbol,
            context: `withoutSupport in "${difficultyString}"`,
          });
        }
      } else if (symbol === "RP") {
        i++; // Move to next symbol
        if (i < symbols.length && SCALA.includes(symbols[i])) {
          result.difficulty.RP = symbols[i];
        } else {
          warnings.push({
            type: "INVALID_RP_SYMBOL",
            symbol: symbols[i] || "missing",
            context: `RP in "${difficultyString}"`,
          });
        }
      } else {
        warnings.push({
          type: "UNKNOWN_DIFFICULTY_SYMBOL",
          symbol: symbol,
          context: `in "${difficultyString}"`,
        });
      }

      i++;
    }
    return { result, warnings };
  }

  removeDuplicates(routes, errors) {
    const routeMap = new Map();
    const idMap = new Map();
    const deduplicatedRoutes = [];
    let duplicatesRemoved = 0;

    routes.forEach((route, index) => {
      let shouldAdd = true;

      // Check for duplicate routes (name + summit combination)
      const routeKey = `${route.name}|${route.summit}`;
      if (routeMap.has(routeKey)) {
        errors.push({
          type: "DUPLICATE_ROUTE_REMOVED",
          value: `${route.name} at ${route.summit}`,
          originalIndex: routeMap.get(routeKey),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      // Check for duplicate teufelsturmIds (only if route key is unique)
      if (shouldAdd && route.teufelsturmId && idMap.has(route.teufelsturmId)) {
        errors.push({
          type: "DUPLICATE_TEUFELSTURM_ID_REMOVED",
          value: route.teufelsturmId,
          routeName: route.name,
          originalIndex: idMap.get(route.teufelsturmId),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      if (shouldAdd) {
        routeMap.set(routeKey, index);
        if (route.teufelsturmId) {
          idMap.set(route.teufelsturmId, index);
        }
        deduplicatedRoutes.push(route);
      }
    });

    if (duplicatesRemoved > 0) {
      this.logger.info(`Removed ${duplicatesRemoved} duplicate routes`);
    }

    return deduplicatedRoutes;
  }
}

module.exports = TeufelsturmRoutesImporter;
