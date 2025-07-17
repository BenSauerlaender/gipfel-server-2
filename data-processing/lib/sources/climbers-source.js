const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const ErrorHandler = require("../core/error-handler");

/**
 * Climbers data source handler
 * Processes climbers data from JSON file with caching support
 */
class ClimbersSource extends BaseSource {
  constructor(config, logger, cache = null) {
    super(config, logger, cache);

    // Validate that input files are configured
    if (!config.inputFile && !config.inputFiles) {
      throw new ProcessingError(
        "ClimbersSource requires either inputFile or inputFiles to be configured",
        ProcessingError.Categories.CONFIG_ERROR,
        this.sourceName,
        { config }
      );
    }

    // Always use inputFiles array, wrap single file if needed
    this.inputFiles = config.inputFiles || [config.inputFile];
  }

  /**
   * Fetch raw climbers data from JSON files
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Array>} Array of file data objects
   * @throws {ProcessingError} When file cannot be read
   */
  async fetch(dependencies = {}) {
    this.logProgress(
      "fetch",
      `Reading climbers data from ${this.inputFiles.length} files`
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
   * Parse raw JSON data into structured climbers object with metadata
   * @param {Array} fileDataArray - Array of file data objects
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Object>} Object with climbers array and metadata
   * @throws {ProcessingError} When JSON parsing fails
   */
  async parse(fileDataArray, dependencies = {}) {
    this.logProgress("parse", "Parsing climbers JSON data");

    try {
      const allClimbers = [];
      const sourceFiles = [];

      for (const fileData of fileDataArray) {
        const { filePath, rawData } = fileData;
        sourceFiles.push(filePath);

        const climbersArray = JSON.parse(rawData);

        if (!Array.isArray(climbersArray)) {
          throw ErrorHandler.createError(
            `Climbers data in ${filePath} must be an array`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            { filePath, dataType: typeof climbersArray }
          );
        }

        // Parse climber names into firstName and lastName objects
        const parsedClimbers = climbersArray.map((climberName, index) => {
          if (typeof climberName !== "string") {
            throw ErrorHandler.createError(
              `Climber name at index ${index} in ${filePath} must be a string`,
              ProcessingError.Categories.PARSE_ERROR,
              this.sourceName,
              { filePath, index, value: climberName, type: typeof climberName }
            );
          }

          const trimmedName = climberName.trim();
          const nameParts = trimmedName.split(" ");

          return {
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
          };
        });

        allClimbers.push(...parsedClimbers);
      }

      const result = {
        climbers: allClimbers,
        metadata: {
          totalProcessed: allClimbers.length,
          processedAt: new Date(),
          sourceFiles: sourceFiles,
        },
      };

      this.logProgress(
        "parse",
        `Successfully parsed ${allClimbers.length} climbers from ${fileDataArray.length} files`
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
   * Get source files that this processor depends on
   * @returns {string[]} Array of source file paths
   */
  getSourceFiles() {
    return this.inputFiles;
  }
}

module.exports = ClimbersSource;
