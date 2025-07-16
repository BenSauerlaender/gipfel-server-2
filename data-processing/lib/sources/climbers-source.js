const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");

/**
 * Climbers data source handler
 * Processes climbers data from JSON file with caching support
 */
class ClimbersSource extends BaseSource {
  constructor(config, logger, cache, processor) {
    super(config, logger, cache, processor);
    this.inputFile = config.inputFile || "data-proccessing/input/climbers.json";
  }

  /**
   * Fetch raw climbers data from JSON file
   * @returns {Promise<string>} Raw JSON string
   * @throws {ProcessingError} When file cannot be read
   */
  async fetch() {
    this.logProgress("fetch", `Reading climbers data from ${this.inputFile}`);

    try {
      const rawData = await fs.readFile(this.inputFile, "utf8");
      this.logProgress(
        "fetch",
        `Successfully read ${rawData.length} characters from file`
      );
      return rawData;
    } catch (error) {
      const errorMsg = `Failed to read climbers file: ${error.message}`;
      this.logError("fetch", error);
      throw new ProcessingError(
        errorMsg,
        ProcessingError.Categories.SOURCE_ERROR,
        this.sourceName,
        { inputFile: this.inputFile, originalError: error.message }
      );
    }
  }

  /**
   * Parse raw JSON data into structured climbers object with metadata
   * @param {string} rawData - Raw JSON string
   * @returns {Promise<Object>} Object with climbers array and metadata
   * @throws {ProcessingError} When JSON parsing fails
   */
  async parse(rawData) {
    this.logProgress("parse", "Parsing climbers JSON data");

    try {
      const climbersArray = JSON.parse(rawData);

      if (!Array.isArray(climbersArray)) {
        throw new ProcessingError(
          "Climbers data must be an array",
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { dataType: typeof climbersArray }
        );
      }

      // Parse climber names into firstName and lastName objects
      const parsedClimbers = climbersArray.map((climberName, index) => {
        if (typeof climberName !== "string") {
          throw new ProcessingError(
            `Climber name at index ${index} must be a string`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            { index, value: climberName, type: typeof climberName }
          );
        }

        const trimmedName = climberName.trim();
        const nameParts = trimmedName.split(" ");

        return {
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
        };
      });

      const result = {
        climbers: parsedClimbers,
        metadata: {
          totalProcessed: parsedClimbers.length,
          processedAt: new Date(),
          sourceFiles: [this.inputFile],
        },
      };

      this.logProgress(
        "parse",
        `Successfully parsed ${parsedClimbers.length} climbers`
      );
      return result;
    } catch (error) {
      if (error instanceof ProcessingError) {
        throw error;
      }

      const errorMsg = `Failed to parse climbers JSON: ${error.message}`;
      this.logError("parse", error);
      throw new ProcessingError(
        errorMsg,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { originalError: error.message }
      );
    }
  }

  /**
   * Validate parsed climbers data
   * @param {Object} parsedData - Object with climbers array and metadata
   * @returns {Promise<Object>} Validated climbers data with metadata
   * @throws {ProcessingError} When validation fails
   */
  async validate(parsedData) {
    // Call parent validation first (handles null/undefined)
    await super.validate(parsedData);

    // Validate structure
    if (!parsedData.climbers || !Array.isArray(parsedData.climbers)) {
      throw new ProcessingError(
        "Invalid data structure: climbers must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { dataType: typeof parsedData.climbers }
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
      `Validating ${parsedData.climbers.length} climbers`
    );

    const validatedClimbers = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < parsedData.climbers.length; i++) {
      const climber = parsedData.climbers[i];

      try {
        const validatedClimber = await this.validateSingleClimber(climber, i);
        validatedClimbers.push(validatedClimber);
      } catch (error) {
        if (error instanceof ProcessingError) {
          errors.push({
            index: i,
            climber: climber,
            error: error.message,
          });
        } else {
          errors.push({
            index: i,
            climber: climber,
            error: `Unexpected validation error: ${error.message}`,
          });
        }
      }
    }

    // Check for duplicate names
    const nameMap = new Map();
    validatedClimbers.forEach((climber, index) => {
      const fullName = `${climber.firstName} ${climber.lastName}`.trim();
      const normalizedName = fullName.toLowerCase();
      if (nameMap.has(normalizedName)) {
        warnings.push({
          type: "duplicate_name",
          message: `Duplicate climber name found: "${fullName}"`,
          indices: [nameMap.get(normalizedName), index],
        });
      } else {
        nameMap.set(normalizedName, index);
      }
    });

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} errors in climbers data`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `Validation found ${warnings.length} warnings in climbers data`,
        { warnings }
      );
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedClimbers.length} climbers (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      climbers: validatedClimbers,
      metadata: {
        ...parsedData.metadata,
        validatedAt: new Date(),
        validationResults: {
          totalValidated: validatedClimbers.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      },
    };
  }

  /**
   * Validate a single climber object
   * @param {Object} climber - Climber object to validate
   * @param {number} index - Index in the array for error reporting
   * @returns {Promise<Object>} Validated climber object
   * @throws {ProcessingError} When validation fails
   */
  async validateSingleClimber(climber, index) {
    if (typeof climber !== "object" || climber === null) {
      throw new ProcessingError(
        `Climber at index ${index} must be an object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, climber: climber }
      );
    }

    if (typeof climber.firstName !== "string") {
      throw new ProcessingError(
        `Climber at index ${index} must have a firstName string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, climber: climber }
      );
    }

    if (typeof climber.lastName !== "string") {
      throw new ProcessingError(
        `Climber at index ${index} must have a lastName string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, climber: climber }
      );
    }

    const fullName = `${climber.firstName} ${climber.lastName}`.trim();
    if (fullName.length === 0) {
      throw new ProcessingError(
        `Climber at index ${index} cannot have an empty name`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, climber: climber }
      );
    }

    return {
      firstName: climber.firstName.trim(),
      lastName: climber.lastName.trim(),
    };
  }

  /**
   * Process climbers data with caching support
   * @returns {Promise<Object>} Processed climbers data with metadata
   */
  async process() {
    const cacheKey = this.getCacheKey();

    // Check cache first if enabled
    if (this.cacheEnabled && this.cache) {
      const sourceFiles = this.getSourceFiles();
      const isSourceNewer = await this.cache.isSourceNewer(
        cacheKey,
        sourceFiles
      );

      if (!isSourceNewer) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          const climberCount = cached.climbers ? cached.climbers.length : 0;
          this.logger.info(
            `Using cached climbers data (${climberCount} climbers)`
          );
          return cached;
        }
      } else {
        this.logger.debug(
          "Source files are newer than cache, processing fresh data"
        );
      }
    }

    // Process data
    this.logProgress("process", "Starting climbers data processing");

    const rawData = await this.fetch();
    const parsedData = await this.parse(rawData);
    const validatedData = await this.validate(parsedData);

    // Cache result if enabled
    if (this.cacheEnabled && this.cache) {
      try {
        await this.cache.set(cacheKey, validatedData);
        this.logger.debug(`Cached climbers data with key: ${cacheKey}`);
      } catch (error) {
        this.logger.warn("Failed to cache climbers data:", error.message);
        // Don't fail the entire process if caching fails
      }
    }

    this.logProgress(
      "process",
      `Successfully processed ${validatedData.climbers.length} climbers`
    );
    return validatedData;
  }

  /**
   * Get source files that this processor depends on
   * @returns {string[]} Array of source file paths
   */
  getSourceFiles() {
    return [this.inputFile];
  }
}

module.exports = ClimbersSource;
