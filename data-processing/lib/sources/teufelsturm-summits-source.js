const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const fixSummitName = require("../util/fixSummitName");
const cheerio = require("cheerio");

/**
 * Teufelsturm summits data source handler
 * Processes HTML files from Teufelsturm website to extract climbing summit data
 */
class TeufelsturmSummitsSource extends BaseSource {
  constructor(config, logger, cache, processor) {
    super(config, logger, cache, processor);
  }

  /**
   * Fetch HTML content from configured input file
   * @returns {Promise<String>} HTML content from file
   */
  async fetch() {
    this.logProgress("fetch", "Loading HTML file");

    const inputFile = this.config.inputFile || "";

    if (!inputFile) {
      throw new ProcessingError(
        "No input file specified in configuration",
        ProcessingError.Categories.SOURCE_ERROR,
        this.sourceName,
        { inputFile }
      );
    }

    try {
      this.logger.debug(`Reading file: ${inputFile}`);
      const content = await fs.readFile(inputFile, "utf8");
      this.logProgress("fetch", `Loaded HTML file`);
      return content;
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new ProcessingError(
          `File not found: ${inputFile}`,
          ProcessingError.Categories.SOURCE_ERROR,
          this.sourceName,
          { inputFile }
        );
      }
      throw new ProcessingError(
        `Failed to read file ${inputFile}: ${error.message}`,
        ProcessingError.Categories.SOURCE_ERROR,
        this.sourceName,
        { inputFile, error: error.message }
      );
    }
  }

  /**
   * Parse HTML content to extract summit data
   * @param String htmlContent - downloaded html
   * @returns {Promise<Object>} Parsed summit data with regions and summits
   */
  async parse(htmlContent) {
    try {
      this.logProgress("parse", "Parsing HTML content");
      const summits = await this.processHtmlFile(htmlContent);

      this.logger.debug(`Extracted ${summits.length} summits`);

      // Extract unique regions and summits
      const uniqueRegions = this.extractUniqueRegions(summits);
      const uniqueSummits = this.extractUniqueSummits(summits);

      const result = {
        regions: uniqueRegions,
        summits: uniqueSummits,
        metadata: {
          totalProcessed: summits.length,
          processedAt: new Date(),
          sourceFiles: this.getSourceFiles(),
        },
      };

      this.logProgress(
        "parse",
        `Extracted ${uniqueRegions.length} regions, ${uniqueSummits.length} summits`
      );
      return result;
    } catch (error) {
      throw new ProcessingError(
        `Failed to parse HTML content: ${error.message}`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { error: error.message }
      );
    }
  }

  /**
   * Process a single HTML file to extract summit data
   * @param {string} htmlContent - HTML content
   * @returns {Promise<Array>} Array of summit objects
   */
  async processHtmlFile(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const rows = $("tr").toArray();

    return rows
      .map((row, idx) => {
        const cells = $(row).find("td");
        if (cells.length < 4) {
          return null;
        }

        // Summit name and link in 2nd cell
        const summitLink = $(cells[1]).find('a[href*="gipfelnr="]');
        if (!summitLink.length) {
          return null;
        }

        const summitName = fixSummitName(summitLink.text().trim());
        const href = summitLink.attr("href");
        let teufelsturmId = null;
        const match = href.match(/gipfelnr=(\d+)/);
        if (match) {
          teufelsturmId = match[1];
        }

        // Region name in 4th cell
        const regionName = $(cells[3]).text().trim();

        return {
          name: summitName,
          region: regionName,
          teufelsturmId: teufelsturmId,
        };
      })
      .filter((e) => e !== null);
  }

  /**
   * Extract unique regions from summit data
   * @param {Array} summits - Array of summit objects
   * @returns {Array} Array of unique region objects
   */
  extractUniqueRegions(summits) {
    return summits.reduce((acc, summit) => {
      if (!acc.some((r) => r.name === summit.region)) {
        acc.push({ name: summit.region });
      }
      return acc;
    }, []);
  }

  /**
   * Extract unique summits from summit data
   * @param {Array} summits - Array of summit objects
   * @returns {Array} Array of unique summit objects
   */
  extractUniqueSummits(summits) {
    return summits.reduce((acc, summit) => {
      if (
        !acc.some((s) => s.name === summit.name && s.region === summit.region)
      ) {
        acc.push({
          name: summit.name,
          region: summit.region,
          teufelsturmId: summit.teufelsturmId,
        });
      }
      return acc;
    }, []);
  }

  /**
   * Validate parsed data
   * @param {Object} parsedData - Parsed data object
   * @returns {Promise<Object>} Validated data with metadata
   */
  async validate(parsedData) {
    await super.validate(parsedData);

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

    if (!parsedData.metadata || typeof parsedData.metadata !== "object") {
      throw new ProcessingError(
        "Invalid data structure: metadata must be an object",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    this.logProgress(
      "validate",
      `Validating ${parsedData.summits.length} summits`
    );

    const validatedSummits = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < parsedData.summits.length; i++) {
      const summit = parsedData.summits[i];

      try {
        const validatedSummit = await this.validateSingleSummit(summit, i);
        validatedSummits.push(validatedSummit);
      } catch (error) {
        if (error instanceof ProcessingError) {
          errors.push({
            index: i,
            summit: summit,
            error: error.message,
          });
        } else {
          errors.push({
            index: i,
            summit: summit,
            error: `Unexpected validation error: ${error.message}`,
          });
        }
      }
    }

    // Check for summits without teufelsturmId
    const summitsWithoutId = validatedSummits.filter((s) => !s.teufelsturmId);
    if (summitsWithoutId.length > 0) {
      summitsWithoutId.forEach((summit, idx) => {
        warnings.push({
          type: "missing_teufelsturm_id",
          message: `Summit "${summit.name}" in region "${summit.region}" is missing teufelsturmId`,
          summit: summit,
        });
      });
    }

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} errors in summit data`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `Validation found ${warnings.length} warnings in summit data`,
        { warnings }
      );
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedSummits.length} summits (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      regions: parsedData.regions,
      summits: validatedSummits,
      metadata: {
        ...parsedData.metadata,
        validatedAt: new Date(),
        validationResults: {
          totalValidated: validatedSummits.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      },
    };
  }

  /**
   * Validate a single summit object
   * @param {Object} summit - Summit object to validate
   * @param {number} index - Index in the array for error reporting
   * @returns {Promise<Object>} Validated summit object
   * @throws {ProcessingError} When validation fails
   */
  async validateSingleSummit(summit, index) {
    if (typeof summit !== "object" || summit === null) {
      throw new ProcessingError(
        `Summit at index ${index} must be an object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, summit: summit }
      );
    }

    if (!summit.name || typeof summit.name !== "string") {
      throw new ProcessingError(
        `Summit at index ${index} must have a name string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, summit: summit }
      );
    }

    if (!summit.region || typeof summit.region !== "string") {
      throw new ProcessingError(
        `Summit at index ${index} must have a region string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, summit: summit }
      );
    }

    const summitName = summit.name.trim();
    const regionName = summit.region.trim();

    if (summitName.length === 0) {
      throw new ProcessingError(
        `Summit at index ${index} cannot have an empty name`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, summit: summit }
      );
    }

    if (regionName.length === 0) {
      throw new ProcessingError(
        `Summit at index ${index} cannot have an empty region`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, summit: summit }
      );
    }

    return {
      name: summitName,
      region: regionName,
      teufelsturmId: summit.teufelsturmId || undefined,
    };
  }

  /**
   * Process data with caching support
   * @returns {Promise<Object>} Processed data
   */
  async process() {
    const cacheKey = this.getCacheKey();

    // Check cache first
    if (this.cacheEnabled && this.cache) {
      const sourceFiles = this.getSourceFiles();
      const isSourceNewer = await this.cache.isSourceNewer(
        cacheKey,
        sourceFiles
      );

      if (!isSourceNewer) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached data for ${this.sourceName}`);
          return cached;
        }
      }
    }

    // Process data
    this.logProgress("process", "Starting data processing");
    const rawData = await this.fetch();
    const parsedData = await this.parse(rawData);
    const validatedData = await this.validate(parsedData);

    // Cache result
    if (this.cacheEnabled && this.cache) {
      try {
        await this.cache.set(cacheKey, validatedData);
        this.logger.debug(`Cached data with key: ${cacheKey}`);
      } catch (error) {
        this.logger.warn("Failed to cache data:", error.message);
        // Don't fail the entire process if caching fails
      }
    }

    this.logProgress("process", "Data processing completed");
    return validatedData;
  }

  /**
   * Get source files that this processor depends on
   * @returns {Array} Array of source file paths
   */
  getSourceFiles() {
    return this.config.inputFile ? [this.config.inputFile] : [];
  }
}

module.exports = TeufelsturmSummitsSource;
