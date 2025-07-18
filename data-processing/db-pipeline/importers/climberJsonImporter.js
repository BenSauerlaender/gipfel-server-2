const fs = require("fs");

class ClimberJsonImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(
      `Importing climbers JSON data from ${files.length} files:`
    );
    this.logger.debug(`files to import:`, files);

    const allClimbers = [];

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
      allClimbers.push(...result.climbers);
    }

    // Remove duplicate climbers
    const deduplicatedClimbers = this.removeDuplicates(allClimbers, warnings);

    this.logger.info(
      `Successfully processed ${deduplicatedClimbers.length} climbers`
    );
    if (allClimbers.length > deduplicatedClimbers.length) {
      this.logger.info(
        `Removed ${allClimbers.length - deduplicatedClimbers.length} duplicate climbers`
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
          climbersProcessed: deduplicatedClimbers.length,
        },
      },
      data: {
        climbers: deduplicatedClimbers,
      },
    };
  }

  processJsonFile(jsonContent, file) {
    const warnings = [];
    const errors = [];
    const climbers = [];

    if (!jsonContent || typeof jsonContent !== "string") {
      errors.push({ type: "INVALID_JSON_CONTENT", sourceFile: file });
      return { climbers: [], warnings, errors };
    }

    let fileData;
    try {
      fileData = JSON.parse(jsonContent);
    } catch (error) {
      errors.push({
        type: "JSON_PARSE_ERROR",
        sourceFile: file,
        message: error.message,
      });
      return { climbers: [], warnings, errors };
    }

    if (!fileData || typeof fileData !== "object" || Array.isArray(fileData)) {
      errors.push({
        type: "INVALID_JSON_STRUCTURE",
        sourceFile: file,
        message: "Climbers data must be an object (key-value pairs)",
        dataType: Array.isArray(fileData) ? "array" : typeof fileData,
      });
      return { climbers: [], warnings, errors };
    }

    this.logger.debug(
      `Found ${Object.keys(fileData).length} climber entries in ${file}`
    );

    Object.entries(fileData).forEach(([abbr, name], index) => {
      const result = this.validateSingleClimber(abbr, name, index, file);

      if (result.error) {
        this.logger.debug(`Skipping climber ${index}: ${result.error.type}`);
        errors.push({
          ...result.error,
          sourceFile: file,
        });
        return;
      }

      if (result.warnings) {
        warnings.push(
          ...result.warnings.map((warning) => ({
            ...warning,
            sourceFile: file,
            climberIndex: index,
          }))
        );
      }

      if (result.climber) {
        climbers.push(result.climber);
      }
    });

    return { climbers, warnings, errors };
  }

  validateSingleClimber(abbr, name, index, file) {
    const warnings = [];

    // Validate abbreviation
    if (typeof abbr !== "string") {
      return {
        error: {
          type: "INVALID_ABBREVIATION_TYPE",
          climberIndex: index,
          message: "Abbreviation must be a string",
          value: abbr,
          valueType: typeof abbr,
        },
      };
    }

    const trimmedAbbr = abbr.trim();
    if (trimmedAbbr === "") {
      return {
        error: {
          type: "EMPTY_ABBREVIATION",
          climberIndex: index,
          message: "Abbreviation cannot be empty",
          originalValue: abbr,
        },
      };
    }

    // Validate name
    if (typeof name !== "string") {
      return {
        error: {
          type: "INVALID_NAME_TYPE",
          climberIndex: index,
          message: "Name must be a string",
          value: name,
          valueType: typeof name,
        },
      };
    }

    const trimmedName = name.trim();
    if (trimmedName === "") {
      return {
        error: {
          type: "EMPTY_NAME",
          climberIndex: index,
          message: "Name cannot be empty",
          originalValue: name,
        },
      };
    }

    // Parse name into first and last name
    const nameParts = trimmedName.split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    if (!firstName) {
      return {
        error: {
          type: "MISSING_FIRST_NAME",
          climberIndex: index,
          message: "First name is required",
          fullName: trimmedName,
        },
      };
    }

    // Create validated climber object
    const climber = {
      firstName: firstName,
      lastName: lastName,
      abbr: trimmedAbbr,
    };

    // Add warnings for edge cases
    if (!lastName) {
      warnings.push({
        type: "MISSING_LAST_NAME",
        message: "Climber has no last name",
        fullName: trimmedName,
        abbreviation: trimmedAbbr,
      });
    }

    if (trimmedAbbr.length < 2) {
      warnings.push({
        type: "SHORT_ABBREVIATION",
        message: "Abbreviation is very short (less than 2 characters)",
        abbreviation: trimmedAbbr,
        fullName: trimmedName,
      });
    }

    if (trimmedAbbr.length > 5) {
      warnings.push({
        type: "LONG_ABBREVIATION",
        message: "Abbreviation is very long (more than 5 characters)",
        abbreviation: trimmedAbbr,
        fullName: trimmedName,
      });
    }

    return {
      climber,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  removeDuplicates(climbers, warnings) {
    const nameMap = new Map();
    const abbrMap = new Map();
    const deduplicatedClimbers = [];
    let duplicatesRemoved = 0;

    climbers.forEach((climber, index) => {
      let shouldAdd = true;

      // Check for duplicate full names
      const fullName = `${climber.firstName} ${climber.lastName}`.trim();
      if (nameMap.has(fullName)) {
        warnings.push({
          type: "DUPLICATE_CLIMBER_NAME_REMOVED",
          fullName: fullName,
          abbreviation: climber.abbr,
          originalIndex: nameMap.get(fullName),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      // Check for duplicate abbreviations (only if name is unique)
      if (shouldAdd && abbrMap.has(climber.abbr)) {
        warnings.push({
          type: "DUPLICATE_ABBREVIATION_REMOVED",
          abbreviation: climber.abbr,
          fullName: fullName,
          originalIndex: abbrMap.get(climber.abbr),
          duplicateIndex: index,
        });
        shouldAdd = false;
        duplicatesRemoved++;
      }

      if (shouldAdd) {
        nameMap.set(fullName, index);
        abbrMap.set(climber.abbr, index);
        deduplicatedClimbers.push(climber);
      }
    });

    if (duplicatesRemoved > 0) {
      this.logger.info(`Removed ${duplicatesRemoved} duplicate climbers`);
    }

    return deduplicatedClimbers;
  }
}

module.exports = ClimberJsonImporter;
