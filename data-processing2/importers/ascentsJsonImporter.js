const fs = require("fs");

class AscentJsonImporter {
  constructor(name, logger) {
    this.sourceName = name;
    this.logger = logger;
  }

  import(config, dependencies) {
    const warnings = [];
    const errors = [];

    const files = config.inputFiles;
    this.logger.info(`Importing ascents JSON data from ${files.length} files:`);
    this.logger.debug(`files to import:`, files);

    // Create climber abbreviation map from dependencies
    if (!dependencies.climbersJson?.data?.climbers) {
      errors.push({
        type: "MISSING_CLIMBERS_DEPENDENCY",
        message: "climbersJson dependency is required but not available",
      });

      return {
        metadata: {
          sourceName: this.sourceName,
          processedAt: new Date(),
          warnings,
          errors,
          sourceFiles: files,
          stats: { ascentsProcessed: 0 },
        },
        data: { ascents: [] },
      };
    }

    const climbersAbbrMap = new Map(
      dependencies.climbersJson.data.climbers.map((c) => [c.abbr, c])
    );

    const allAscents = [];

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

      const result = this.processJsonFile(fileData, file, climbersAbbrMap);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      allAscents.push(...result.ascents);
    }

    // Remove duplicates and validate date sequences
    const processedAscents = this.processDuplicatesAndValidation(
      allAscents,
      warnings,
      errors
    );

    this.logger.info(
      `Successfully processed ${processedAscents.length} ascents`
    );
    if (allAscents.length > processedAscents.length) {
      this.logger.info(
        `Removed ${allAscents.length - processedAscents.length} duplicate ascents`
      );
    }

    return {
      metadata: {
        sourceName: this.sourceName,
        processedAt: new Date(),
        warnings,
        errors,
        sourceFiles: files,
        stats: { ascentsProcessed: processedAscents.length },
      },
      data: { ascents: processedAscents },
    };
  }

  processJsonFile(jsonContent, file, climbersAbbrMap) {
    const warnings = [];
    const errors = [];
    const ascents = [];

    if (!jsonContent || typeof jsonContent !== "string") {
      errors.push({ type: "INVALID_JSON_CONTENT", sourceFile: file });
      return { ascents: [], warnings, errors };
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
      return { ascents: [], warnings, errors };
    }

    if (!Array.isArray(fileData)) {
      errors.push({
        type: "INVALID_JSON_STRUCTURE",
        sourceFile: file,
        message: "Ascents data must be an array",
        dataType: typeof fileData,
      });
      return { ascents: [], warnings, errors };
    }

    if (fileData.length === 0) {
      warnings.push({
        type: "EMPTY_ASCENTS_FILE",
        sourceFile: file,
        message: "File contains no ascents",
      });
      return { ascents: [], warnings, errors };
    }

    this.logger.debug(`Found ${fileData.length} ascent entries in ${file}`);

    fileData.forEach((rawAscent, index) => {
      const result = this.validateSingleAscent(
        rawAscent,
        index,
        file,
        climbersAbbrMap
      );

      if (result.error) {
        this.logger.debug(`Skipping ascent ${index}: ${result.error.type}`);
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
            ascentIndex: index,
          }))
        );
      }

      if (result.ascent) {
        ascents.push(result.ascent);
      }
    });

    return { ascents, warnings, errors };
  }

  validateSingleAscent(rawAscent, index, file, climbersAbbrMap) {
    const warnings = [];

    if (typeof rawAscent !== "object" || rawAscent === null) {
      return {
        error: {
          type: "INVALID_ASCENT_OBJECT",
          ascentIndex: index,
          message: "Ascent must be an object",
        },
      };
    }

    const ascent = {};

    // Process climbers (required)
    const climbersResult = this.processClimbersForAscent(
      rawAscent.climbers,
      index,
      climbersAbbrMap
    );
    if (climbersResult.error) {
      return { error: climbersResult.error };
    }
    ascent.climbers = climbersResult.climbers;
    if (climbersResult.warnings) {
      warnings.push(...climbersResult.warnings);
    }

    // Process route (required)
    const routeResult = this.processRoute(rawAscent.route, index);
    if (routeResult.error) {
      return { error: routeResult.error };
    }
    ascent.route = routeResult.route;

    // Process date (required)
    const dateResult = this.processDate(
      rawAscent.date,
      rawAscent.number,
      index
    );
    if (dateResult.error) {
      return { error: dateResult.error };
    }
    ascent.date = dateResult.date;

    // Process lead climber (optional)
    const leadClimberResult = this.processLeadClimber(
      rawAscent.leadClimber,
      index,
      climbersAbbrMap
    );
    if (leadClimberResult.error) {
      return { error: leadClimberResult.error };
    }
    if (leadClimberResult.leadClimber) {
      ascent.leadClimber = leadClimberResult.leadClimber;
    }
    if (leadClimberResult.warnings) {
      warnings.push(...leadClimberResult.warnings);
    }

    // Process optional fields
    const optionalResult = this.processOptionalFields(rawAscent, index);
    Object.assign(ascent, optionalResult.fields);
    if (optionalResult.warnings) {
      warnings.push(...optionalResult.warnings);
    }

    // Validate and correct lead climber position in climbers array (only if leadClimber is set)
    if (ascent.leadClimber) {
      const leadClimberValidation = this.validateLeadClimberInArray(
        ascent.leadClimber,
        ascent.climbers,
        index
      );
      if (leadClimberValidation.correctedClimbers) {
        ascent.climbers = leadClimberValidation.correctedClimbers;
      }
      if (leadClimberValidation.warnings) {
        warnings.push(...leadClimberValidation.warnings);
      }
    }

    // Validate climbing style exclusivity (leadClimber OR isSolo OR isTopRope)
    const styleValidation = this.validateClimbingStyleExclusivity(
      ascent,
      index
    );
    if (styleValidation.warnings) {
      warnings.push(...styleValidation.warnings);
    }

    return {
      ascent,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  processClimbersForAscent(climbersData, index, climbersAbbrMap) {
    if (!climbersData) {
      return {
        error: {
          type: "MISSING_CLIMBERS",
          ascentIndex: index,
          message: "Climbers field is required",
        },
      };
    }

    const climbersResult = this.processClimbers(
      climbersData,
      index,
      climbersAbbrMap
    );

    if (climbersResult.climbers.length === 0) {
      return {
        error: {
          type: "NO_VALID_CLIMBERS",
          ascentIndex: index,
          message: "At least one valid climber is required",
        },
      };
    }

    return {
      climbers: climbersResult.climbers,
      warnings: climbersResult.warnings,
    };
  }

  processRoute(routeData, index) {
    if (
      !routeData ||
      typeof routeData !== "string" ||
      routeData.trim() === ""
    ) {
      return {
        error: {
          type: "INVALID_ROUTE",
          ascentIndex: index,
          message: "Route must be a non-empty string",
          value: routeData,
        },
      };
    }

    return { route: routeData.trim() };
  }

  processDate(dateStr, number, index) {
    if (!dateStr || typeof dateStr !== "string") {
      return {
        error: {
          type: "INVALID_DATE_STRING",
          ascentIndex: index,
          message: "Date must be a non-empty string",
          value: dateStr,
        },
      };
    }

    const trimmedDate = dateStr.trim();
    let parsedDate;

    try {
      parsedDate = new Date(trimmedDate);
    } catch (error) {
      return {
        error: {
          type: "DATE_PARSE_ERROR",
          ascentIndex: index,
          message: "Failed to parse date",
          value: trimmedDate,
          parseError: error.message,
        },
      };
    }

    if (isNaN(parsedDate.getTime())) {
      return {
        error: {
          type: "INVALID_DATE_VALUE",
          ascentIndex: index,
          message: "Date is not valid",
          value: trimmedDate,
        },
      };
    }

    // Add number to milliseconds for ordering (if provided)
    if (number !== undefined && number !== null) {
      const numValue = number;
      if (!isNaN(numValue) && numValue > 0 && numValue <= 999) {
        parsedDate.setMilliseconds(numValue);
      }
    }

    return { date: parsedDate };
  }

  processLeadClimber(leadClimberData, index, climbersAbbrMap) {
    // Lead climber is optional - return null if not provided
    if (
      !leadClimberData ||
      typeof leadClimberData !== "string" ||
      leadClimberData.trim() === ""
    ) {
      return { leadClimber: null };
    }

    const trimmed = leadClimberData.trim();
    const climber = climbersAbbrMap.get(trimmed);

    if (!climber) {
      return {
        error: {
          type: "UNKNOWN_LEAD_CLIMBER",
          ascentIndex: index,
          message: "Lead climber abbreviation not found in climbers data",
          value: trimmed,
        },
      };
    }

    return { leadClimber: climber };
  }

  processOptionalFields(rawAscent, index) {
    const fields = {};
    const warnings = [];

    // Process notes
    if (rawAscent.notes !== undefined && rawAscent.notes !== null) {
      if (
        typeof rawAscent.notes === "string" &&
        rawAscent.notes.trim() !== ""
      ) {
        fields.notes = rawAscent.notes.trim();
      }
    }

    // Process boolean flags with validation
    const booleanFields = [
      "isTopRope",
      "isSolo",
      "isWithoutSupport",
      "isAborted",
    ];

    booleanFields.forEach((fieldName) => {
      if (rawAscent[fieldName] !== undefined && rawAscent[fieldName] !== null) {
        if (typeof rawAscent[fieldName] === "boolean") {
          fields[fieldName] = rawAscent[fieldName];
        } else {
          // Field is set but not a boolean - warn and don't set the field
          warnings.push({
            type: "INVALID_BOOLEAN_FIELD",
            field: fieldName,
            value: rawAscent[fieldName],
            valueType: typeof rawAscent[fieldName],
            message: `Field "${fieldName}" must be a boolean, found ${typeof rawAscent[fieldName]}. Field will be ignored.`,
          });
        }
      }
    });

    // Process any other optional fields that might be present
    const knownFields = [
      "climbers",
      "route",
      "summit",
      "date",
      "number",
      "leadClimber",
      "notes",
      "isTopRope",
      "isSolo",
      "isWithoutSupport",
      "isAborted",
    ];
    Object.keys(rawAscent).forEach((key) => {
      if (!knownFields.includes(key)) {
        warnings.push({
          type: "UNKNOWN_FIELD",
          field: key,
          value: rawAscent[key],
          message: `Unknown field "${key}" found in ascent data`,
        });
      }
    });

    return { fields, warnings: warnings.length > 0 ? warnings : undefined };
  }

  processDuplicatesAndValidation(allAscents, warnings, errors) {
    // Remove duplicate dates
    const uniqueDates = new Map();
    const duplicatesRemoved = [];

    allAscents.forEach((ascent, index) => {
      const dateKey = `${ascent.date.getFullYear()}-${ascent.date.getMonth() + 1}-${ascent.date.getDate()}:${ascent.date.getMilliseconds()}`;

      if (uniqueDates.has(dateKey)) {
        duplicatesRemoved.push({
          type: "DUPLICATE_DATE_REMOVED",
          dateKey: dateKey,
          originalIndex: uniqueDates.get(dateKey).originalIndex,
          duplicateIndex: index,
        });
      } else {
        uniqueDates.set(dateKey, { ascent, originalIndex: index });
      }
    });

    if (duplicatesRemoved.length > 0) {
      warnings.push(...duplicatesRemoved);
      this.logger.info(
        `Removed ${duplicatesRemoved.length} ascents with duplicate dates`
      );
    }

    const deduplicatedAscents = Array.from(uniqueDates.values()).map(
      (item) => item.ascent
    );

    // Validate date number sequences
    this.validateDateSequences(deduplicatedAscents, warnings);

    return deduplicatedAscents;
  }

  validateDateSequences(ascents, warnings) {
    const ascentsByDate = new Map();

    ascents.forEach((ascent) => {
      const dateKey = `${ascent.date.getFullYear()}-${ascent.date.getMonth() + 1}-${ascent.date.getDate()}`;
      if (!ascentsByDate.has(dateKey)) {
        ascentsByDate.set(dateKey, []);
      }
      ascentsByDate.get(dateKey).push(ascent);
    });

    for (const [date, dayAscents] of ascentsByDate.entries()) {
      if (dayAscents.length > 1) {
        // Check if numbers start from 1 and are sequential
        const sortedNumbers = dayAscents
          .map((a) => a.date.getMilliseconds())
          .sort((a, b) => a - b);

        for (let i = 0; i < sortedNumbers.length; i++) {
          if (sortedNumbers[i] !== i + 1) {
            warnings.push({
              type: "NON_SEQUENTIAL_DATE_NUMBER",
              date: date,
              expected: i + 1,
              actual: sortedNumbers[i],
              ascentsOfDay: dayAscents.map((a) => a.date),
              message: `Date numbers should be sequential starting from 1`,
            });
          }
        }
      }
    }
  }

  processClimbers(climbers, index, climbersAbbrMap) {
    const warnings = [];
    const errors = [];

    if (!Array.isArray(climbers)) {
      errors.push({
        type: "INVALID_CLIMBERS_FORMAT",
        ascentIndex: index,
        message: "Expected array of climbers",
        value: climbers,
        valueType: typeof climbers,
      });
      return { climbers: [], warnings, errors };
    }

    if (climbers.length === 0) {
      errors.push({
        type: "EMPTY_CLIMBERS_ARRAY",
        ascentIndex: index,
        message: "Climbers array cannot be empty",
      });
      return { climbers: [], warnings, errors };
    }

    const parsedClimbers = [];

    climbers.forEach((climberStr, climberIndex) => {
      const result = this.parseSingleClimber(
        climberStr,
        index,
        climberIndex,
        climbersAbbrMap
      );

      if (result.error) {
        errors.push(result.error);
        return;
      }

      if (result.warning) {
        warnings.push(result.warning);
        return;
      }

      if (result.climber) {
        parsedClimbers.push(result.climber);
      }
    });

    return { climbers: parsedClimbers, warnings, errors };
  }

  parseSingleClimber(climberStr, ascentIndex, climberIndex, climbersAbbrMap) {
    if (typeof climberStr !== "string") {
      return {
        error: {
          type: "INVALID_CLIMBER_FORMAT",
          ascentIndex: ascentIndex,
          climberIndex: climberIndex,
          message: "Expected string",
          value: climberStr,
          valueType: typeof climberStr,
        },
      };
    }

    const { abbr, isAborted } = this.extractClimberInfo(climberStr);

    if (!abbr) {
      return {
        warning: {
          type: "EMPTY_CLIMBER_ABBREVIATION",
          ascentIndex: ascentIndex,
          climberIndex: climberIndex,
          value: climberStr,
          message: "Climber abbreviation is empty",
        },
      };
    }

    const climber = climbersAbbrMap.get(abbr);
    if (!climber) {
      return {
        warning: {
          type: "UNKNOWN_CLIMBER_ABBREVIATION",
          ascentIndex: ascentIndex,
          climberIndex: climberIndex,
          value: abbr,
          message: "Climber abbreviation not found in climbers data",
        },
      };
    }

    return {
      climber: { climber, isAborted },
    };
  }

  extractClimberInfo(climberStr) {
    const trimmed = climberStr.trim();

    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      return {
        abbr: trimmed.slice(1, -1).trim(),
        isAborted: true,
      };
    }

    return {
      abbr: trimmed,
      isAborted: false,
    };
  }

  validateLeadClimberInArray(leadClimber, climbersArray, index) {
    const warnings = [];
    let correctedClimbers = null;

    if (!leadClimber || !climbersArray || climbersArray.length === 0) {
      return { warnings: [], correctedClimbers: null };
    }

    // Find the lead climber in the climbers array
    const leadClimberIndex = climbersArray.findIndex(
      (climber) => climber.climber.abbr === leadClimber.abbr
    );

    if (leadClimberIndex === -1) {
      // Lead climber not found in climbers array - add to the beginning
      warnings.push({
        type: "LEAD_CLIMBER_NOT_IN_ARRAY",
        ascentIndex: index,
        leadClimber: leadClimber.abbr,
        message:
          "Lead climber not found in climbers array. Adding to the beginning.",
      });

      correctedClimbers = [
        { climber: leadClimber, isAborted: false },
        ...climbersArray,
      ];
    } else if (leadClimberIndex !== 0) {
      // Lead climber found but not at first position - move to beginning
      warnings.push({
        type: "LEAD_CLIMBER_NOT_FIRST",
        ascentIndex: index,
        leadClimber: leadClimber.abbr,
        currentPosition: leadClimberIndex,
        message: `Lead climber found at position ${leadClimberIndex} instead of first position. Moving to the beginning.`,
      });

      correctedClimbers = [...climbersArray];
      const leadClimberEntry = correctedClimbers.splice(leadClimberIndex, 1)[0];
      correctedClimbers.unshift(leadClimberEntry);
    }

    return {
      warnings: warnings.length > 0 ? warnings : null,
      correctedClimbers,
    };
  }

  validateClimbingStyleExclusivity(ascent, index) {
    const warnings = [];

    // Check for mutually exclusive climbing styles
    const hasLeadClimber = !!ascent.leadClimber;
    const isSolo = ascent.isSolo === true;
    const isTopRope = ascent.isTopRope === true;

    const activeStyles = [];
    if (hasLeadClimber) activeStyles.push("leadClimber");
    if (isSolo) activeStyles.push("isSolo");
    if (isTopRope) activeStyles.push("isTopRope");

    if (activeStyles.length > 1) {
      warnings.push({
        type: "MULTIPLE_CLIMBING_STYLES",
        ascentIndex: index,
        activeStyles: activeStyles,
        message: `An ascent can only have one climbing style. Found: ${activeStyles.join(
          ", "
        )}. These should be mutually exclusive.`,
      });
    }

    return {
      warnings: warnings.length > 0 ? warnings : null,
    };
  }
}

module.exports = AscentJsonImporter;
