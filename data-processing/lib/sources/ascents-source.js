const fs = require("fs").promises;
const BaseSource = require("./base-source");
const ProcessingError = require("../core/error");
const ErrorHandler = require("../core/error-handler");

/**
 * Ascents data source handler
 * Processes ascents data from JSON file with climber abbreviation mapping and caching support
 */
class AscentsSource extends BaseSource {
  constructor(config, logger, cache = null) {
    super(config, logger, cache);

    // Validate that input files are configured
    if (!config.inputFile && !config.inputFiles) {
      throw new ProcessingError(
        "AscentsSource requires either inputFile or inputFiles to be configured",
        ProcessingError.Categories.CONFIG_ERROR,
        this.sourceName,
        { config }
      );
    }

    // Always use inputFiles array, wrap single file if needed
    this.inputFiles = config.inputFiles || [config.inputFile];
  }

  /**
   * Fetch raw ascents data from JSON files
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Array>} Array of file data objects
   * @throws {ProcessingError} When file cannot be read
   */
  async fetch(dependencies = {}) {
    this.logProgress(
      "fetch",
      `Reading ascents data from ${this.inputFiles.length} files`
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
   * Parse raw JSON data into structured ascents object with metadata
   * @param {Array} fileDataArray - Array of file data objects
   * @param {Object} dependencies - Resolved dependency data (unused by this source)
   * @returns {Promise<Object>} Object with ascents array and metadata
   * @throws {ProcessingError} When JSON parsing fails
   */
  async parse(fileDataArray, dependencies = {}) {
    this.logProgress("parse", "Parsing ascents JSON data");

    try {
      return await this.parseMultipleFiles(fileDataArray);
    } catch (error) {
      throw ErrorHandler.wrapError(
        error,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName
      );
    }
  }

  /**
   * Parse single file data
   * @param {string} rawData - Raw JSON string
   * @returns {Promise<Object>} Object with ascents array and metadata
   */
  async parseSingleFile(rawData) {
    const data = JSON.parse(rawData);

    if (typeof data !== "object" || data === null) {
      throw new ProcessingError(
        "Ascents data must be an object",
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { dataType: typeof data }
      );
    }

    if (!data.climberAbbrMap || typeof data.climberAbbrMap !== "object") {
      throw new ProcessingError(
        "Ascents data must contain climberAbbrMap object",
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { hasClimberAbbrMap: !!data.climberAbbrMap }
      );
    }

    if (!Array.isArray(data.ascents)) {
      throw new ProcessingError(
        "Ascents data must contain ascents array",
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { dataType: typeof data.ascents }
      );
    }

    // Process each ascent
    const processedAscents = [];
    const dateGroups = new Map(); // Track ascents by date for consecutive milliseconds

    for (let i = 0; i < data.ascents.length; i++) {
      const ascent = data.ascents[i];
      try {
        const processedAscent = await this.parseAscent(
          ascent,
          i,
          data.climberAbbrMap
        );
        processedAscents.push(processedAscent);

        // Track for consecutive milliseconds
        const dateKey = processedAscent.date.toDateString();
        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, []);
        }
        dateGroups.get(dateKey).push(processedAscent);
      } catch (error) {
        if (error instanceof ProcessingError) {
          throw error;
        }
        throw new ProcessingError(
          `Failed to parse ascent at index ${i}: ${error.message}`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { index: i, ascent: ascent, originalError: error.message }
        );
      }
    }

    // Apply consecutive milliseconds for same-day ascents
    this.applyConsecutiveMilliseconds(dateGroups);

    const result = {
      ascents: processedAscents,
      metadata: {
        totalProcessed: processedAscents.length,
        processedAt: new Date(),
        sourceFiles: this.inputFiles,
      },
    };

    this.logProgress(
      "parse",
      `Successfully parsed ${processedAscents.length} ascents`
    );
    return result;
  }

  /**
   * Parse multiple files data
   * @param {Array} fileDataArray - Array of file data objects
   * @returns {Promise<Object>} Object with ascents array and metadata
   */
  async parseMultipleFiles(fileDataArray) {
    const allProcessedAscents = [];
    const allDateGroups = new Map();
    const sourceFiles = [];
    let totalAscentIndex = 0;

    for (const fileData of fileDataArray) {
      const { filePath, rawData } = fileData;
      sourceFiles.push(filePath);

      const data = JSON.parse(rawData);

      if (typeof data !== "object" || data === null) {
        throw new ProcessingError(
          `Ascents data in ${filePath} must be an object`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { filePath, dataType: typeof data }
        );
      }

      if (!data.climberAbbrMap || typeof data.climberAbbrMap !== "object") {
        throw new ProcessingError(
          `Ascents data in ${filePath} must contain climberAbbrMap object`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { filePath, hasClimberAbbrMap: !!data.climberAbbrMap }
        );
      }

      if (!Array.isArray(data.ascents)) {
        throw new ProcessingError(
          `Ascents data in ${filePath} must contain ascents array`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { filePath, dataType: typeof data.ascents }
        );
      }

      // Process each ascent in this file
      for (let i = 0; i < data.ascents.length; i++) {
        const ascent = data.ascents[i];
        try {
          const processedAscent = await this.parseAscent(
            ascent,
            totalAscentIndex,
            data.climberAbbrMap
          );
          allProcessedAscents.push(processedAscent);

          // Track for consecutive milliseconds across all files
          const dateKey = processedAscent.date.toDateString();
          if (!allDateGroups.has(dateKey)) {
            allDateGroups.set(dateKey, []);
          }
          allDateGroups.get(dateKey).push(processedAscent);

          totalAscentIndex++;
        } catch (error) {
          if (error instanceof ProcessingError) {
            throw error;
          }
          throw new ProcessingError(
            `Failed to parse ascent at index ${i} in ${filePath}: ${error.message}`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            { filePath, index: i, ascent: ascent, originalError: error.message }
          );
        }
      }
    }

    // Apply consecutive milliseconds for same-day ascents across all files
    this.applyConsecutiveMilliseconds(allDateGroups);

    const result = {
      ascents: allProcessedAscents,
      metadata: {
        totalProcessed: allProcessedAscents.length,
        processedAt: new Date(),
        sourceFiles: sourceFiles,
      },
    };

    this.logProgress(
      "parse",
      `Successfully parsed ${allProcessedAscents.length} ascents from ${fileDataArray.length} files`
    );
    return result;
  }

  /**
   * Parse a single ascent object
   * @param {Object} ascent - Raw ascent object
   * @param {number} index - Index for error reporting
   * @param {Object} climberAbbrMap - Climber abbreviation mapping
   * @returns {Promise<Object>} Parsed ascent object
   * @throws {ProcessingError} When parsing fails
   */
  async parseAscent(ascent, index, climberAbbrMap) {
    if (typeof ascent !== "object" || ascent === null) {
      throw new ProcessingError(
        `Ascent at index ${index} must be an object`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    // Validate required fields
    if (typeof ascent.date !== "string" || !ascent.date.trim()) {
      throw new ProcessingError(
        `Ascent at index ${index} must have a valid date string`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    // Handle missing number field by auto-generating it
    let number = ascent.number;
    if (typeof number !== "number") {
      // Auto-generate number based on position in same-date group
      // This will be corrected later in applyConsecutiveMilliseconds
      number = 1;
      this.logger.debug(
        `Auto-generated number ${number} for ascent at index ${index} on ${ascent.date}`
      );
    }

    if (typeof ascent.route !== "string" || !ascent.route.trim()) {
      throw new ProcessingError(
        `Ascent at index ${index} must have a valid route string`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    if (!Array.isArray(ascent.climbers) || ascent.climbers.length === 0) {
      throw new ProcessingError(
        `Ascent at index ${index} must have at least one climber`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    // Parse date with number as milliseconds
    const baseDate = new Date(ascent.date);
    if (isNaN(baseDate.getTime())) {
      throw new ProcessingError(
        `Ascent at index ${index} has invalid date format: ${ascent.date}`,
        ProcessingError.Categories.PARSE_ERROR,
        this.sourceName,
        { index, ascent, date: ascent.date }
      );
    }

    // Add number as milliseconds to the date
    const dateWithMs = new Date(baseDate.getTime() + number);

    // Process climbers array
    const processedClimbers = [];
    for (let i = 0; i < ascent.climbers.length; i++) {
      const climberAbbr = ascent.climbers[i];
      if (typeof climberAbbr !== "string") {
        throw new ProcessingError(
          `Climber at index ${i} in ascent ${index} must be a string`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          { ascentIndex: index, climberIndex: i, climber: climberAbbr }
        );
      }

      // Check if climber is in parentheses (aborted)
      const isAborted =
        climberAbbr.startsWith("(") && climberAbbr.endsWith(")");
      const cleanAbbr = isAborted ? climberAbbr.slice(1, -1) : climberAbbr;

      // Map abbreviation to full name
      const fullName = climberAbbrMap[cleanAbbr];
      if (!fullName) {
        throw new ProcessingError(
          `Unknown climber abbreviation: ${cleanAbbr} in ascent ${index}`,
          ProcessingError.Categories.PARSE_ERROR,
          this.sourceName,
          {
            ascentIndex: index,
            climberAbbr: cleanAbbr,
            availableAbbrs: Object.keys(climberAbbrMap),
          }
        );
      }

      processedClimbers.push({
        climber: fullName,
        isAborted: isAborted,
      });
    }

    // Build processed ascent object
    const processedAscent = {
      date: dateWithMs,
      route: ascent.route.trim(),
      climbers: processedClimbers,
    };

    // Add optional fields if present and not empty/null/undefined
    if (ascent.leadClimber !== undefined && ascent.leadClimber !== null) {
      const leadClimberAbbr =
        typeof ascent.leadClimber === "string"
          ? ascent.leadClimber.trim()
          : String(ascent.leadClimber);

      if (leadClimberAbbr !== "") {
        const leadClimberFullName = climberAbbrMap[leadClimberAbbr];
        if (!leadClimberFullName) {
          throw new ProcessingError(
            `Unknown lead climber abbreviation: ${leadClimberAbbr} in ascent ${index}`,
            ProcessingError.Categories.PARSE_ERROR,
            this.sourceName,
            {
              ascentIndex: index,
              leadClimberAbbr,
              availableAbbrs: Object.keys(climberAbbrMap),
            }
          );
        }
        processedAscent.leadClimber = leadClimberFullName;
      }
    }

    if (ascent.isAborted !== undefined && ascent.isAborted !== null) {
      processedAscent.isAborted = Boolean(ascent.isAborted);
    }

    if (ascent.isTopRope !== undefined && ascent.isTopRope !== null) {
      processedAscent.isTopRope = Boolean(ascent.isTopRope);
    }

    if (ascent.isSolo !== undefined && ascent.isSolo !== null) {
      processedAscent.isSolo = Boolean(ascent.isSolo);
    }

    if (
      ascent.isWithoutSupport !== undefined &&
      ascent.isWithoutSupport !== null
    ) {
      processedAscent.isWithoutSupport = Boolean(ascent.isWithoutSupport);
    }

    if (ascent.notes !== undefined && ascent.notes !== null) {
      const notes =
        typeof ascent.notes === "string"
          ? ascent.notes.trim()
          : String(ascent.notes);

      if (notes !== "") {
        processedAscent.notes = notes;
      }
    }

    return processedAscent;
  }

  /**
   * Apply consecutive milliseconds to ascents on the same day
   * @param {Map} dateGroups - Map of date strings to ascent arrays
   */
  applyConsecutiveMilliseconds(dateGroups) {
    for (const [dateKey, ascents] of dateGroups) {
      // Sort by original number field (which is now in milliseconds)
      ascents.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Apply consecutive milliseconds starting from 1
      ascents.forEach((ascent, index) => {
        const baseDate = new Date(ascent.date);
        baseDate.setHours(0, 0, 0, 0); // Reset to start of day
        ascent.date = new Date(baseDate.getTime() + (index + 1)); // Add consecutive milliseconds starting from 1
      });
    }
  }

  /**
   * Validate parsed ascents data
   * @param {Object} parsedData - Object with ascents array and metadata
   * @returns {Promise<Object>} Validated ascents data with metadata
   * @throws {ProcessingError} When validation fails
   */
  async validate(parsedData) {
    // Call parent validation first (handles null/undefined)
    await super.validate(parsedData);

    // Validate structure
    if (!parsedData.ascents || !Array.isArray(parsedData.ascents)) {
      throw new ProcessingError(
        "Invalid data structure: ascents must be an array",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { dataType: typeof parsedData.ascents }
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
      `Validating ${parsedData.ascents.length} ascents`
    );

    const validatedAscents = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < parsedData.ascents.length; i++) {
      const ascent = parsedData.ascents[i];

      try {
        const validatedAscent = await this.validateSingleAscent(ascent, i);
        validatedAscents.push(validatedAscent);
      } catch (error) {
        if (error instanceof ProcessingError) {
          errors.push({
            index: i,
            ascent: ascent,
            error: error.message,
          });
        } else {
          errors.push({
            index: i,
            ascent: ascent,
            error: `Unexpected validation error: ${error.message}`,
          });
        }
      }
    }

    // Validate consecutive milliseconds for same-day ascents
    this.validateConsecutiveMilliseconds(validatedAscents, warnings);

    // Log validation results
    if (errors.length > 0) {
      this.logger.warn(
        `Validation found ${errors.length} errors in ascents data`,
        { errors }
      );
    }

    if (warnings.length > 0) {
      this.logger.warn(
        `Validation found ${warnings.length} warnings in ascents data`,
        { warnings }
      );
    }

    this.logProgress(
      "validate",
      `Successfully validated ${validatedAscents.length} ascents (${errors.length} errors, ${warnings.length} warnings)`
    );

    // Return validated data with updated metadata
    return {
      ascents: validatedAscents,
      metadata: {
        ...parsedData.metadata,
        validatedAt: new Date(),
        validationResults: {
          totalValidated: validatedAscents.length,
          errors: errors.length,
          warnings: warnings.length,
        },
      },
    };
  }

  /**
   * Validate a single ascent object
   * @param {Object} ascent - Ascent object to validate
   * @param {number} index - Index in the array for error reporting
   * @returns {Promise<Object>} Validated ascent object
   * @throws {ProcessingError} When validation fails
   */
  async validateSingleAscent(ascent, index) {
    if (typeof ascent !== "object" || ascent === null) {
      throw new ProcessingError(
        `Ascent at index ${index} must be an object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    // Validate required fields
    if (!(ascent.date instanceof Date) || isNaN(ascent.date.getTime())) {
      throw new ProcessingError(
        `Ascent at index ${index} must have a valid Date object`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, ascent, date: ascent.date }
      );
    }

    if (typeof ascent.route !== "string" || ascent.route.trim().length === 0) {
      throw new ProcessingError(
        `Ascent at index ${index} must have a non-empty route string`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    if (!Array.isArray(ascent.climbers) || ascent.climbers.length === 0) {
      throw new ProcessingError(
        `Ascent at index ${index} must have at least one climber`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, ascent }
      );
    }

    // Validate climbers array
    for (let i = 0; i < ascent.climbers.length; i++) {
      const climber = ascent.climbers[i];
      if (typeof climber !== "object" || climber === null) {
        throw new ProcessingError(
          `Climber at index ${i} in ascent ${index} must be an object`,
          ProcessingError.Categories.VALIDATION_ERROR,
          this.sourceName,
          { ascentIndex: index, climberIndex: i, climber }
        );
      }

      if (
        typeof climber.climber !== "string" ||
        climber.climber.trim().length === 0
      ) {
        throw new ProcessingError(
          `Climber at index ${i} in ascent ${index} must have a non-empty climber name`,
          ProcessingError.Categories.VALIDATION_ERROR,
          this.sourceName,
          { ascentIndex: index, climberIndex: i, climber }
        );
      }

      if (typeof climber.isAborted !== "boolean") {
        throw new ProcessingError(
          `Climber at index ${i} in ascent ${index} must have a boolean isAborted field`,
          ProcessingError.Categories.VALIDATION_ERROR,
          this.sourceName,
          { ascentIndex: index, climberIndex: i, climber }
        );
      }
    }

    // Validate mutually exclusive fields: leadClimber, isSolo, isTopRope
    const exclusiveFields = [];
    if (ascent.leadClimber !== undefined) exclusiveFields.push("leadClimber");
    if (ascent.isSolo === true) exclusiveFields.push("isSolo");
    if (ascent.isTopRope === true) exclusiveFields.push("isTopRope");

    if (exclusiveFields.length > 1) {
      throw new ProcessingError(
        `Ascent at index ${index} can only have one of: leadClimber, isSolo, or isTopRope (found: ${exclusiveFields.join(", ")})`,
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName,
        { index, ascent, conflictingFields: exclusiveFields }
      );
    }

    // Build validated ascent object (already processed, just return as-is)
    return ascent;
  }

  /**
   * Validate that same-day ascents have consecutive milliseconds starting from 1
   * @param {Array} ascents - Array of validated ascents
   * @param {Array} warnings - Array to collect warnings
   */
  validateConsecutiveMilliseconds(ascents, warnings) {
    const dateGroups = new Map();

    // Group ascents by date
    ascents.forEach((ascent, index) => {
      const dateKey = ascent.date.toDateString();
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, []);
      }
      dateGroups.get(dateKey).push({ ascent, index });
    });

    // Validate consecutive milliseconds for each date group
    for (const [dateKey, group] of dateGroups) {
      if (group.length > 1) {
        // Sort by date to check consecutive order
        group.sort((a, b) => a.ascent.date.getTime() - b.ascent.date.getTime());

        const baseTime = new Date(group[0].ascent.date);
        baseTime.setHours(0, 0, 0, 0);

        for (let i = 0; i < group.length; i++) {
          const expectedTime = baseTime.getTime() + (i + 1);
          const actualTime = group[i].ascent.date.getTime();

          if (actualTime !== expectedTime) {
            warnings.push({
              type: "consecutive_milliseconds",
              message: `Ascent on ${dateKey} at index ${group[i].index} does not have consecutive milliseconds (expected: ${expectedTime}, actual: ${actualTime})`,
              ascentIndex: group[i].index,
              date: dateKey,
              expected: expectedTime,
              actual: actualTime,
            });
          }
        }
      }
    }
  }

  /**
   * Get source files that this processor depends on
   * @returns {string[]} Array of source file paths
   */
  getSourceFiles() {
    return this.inputFiles;
  }
}

module.exports = AscentsSource;
