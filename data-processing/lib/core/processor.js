const Logger = require("./logger");
const ProcessingError = require("./error");

/**
 * Main data processing orchestrator that coordinates processing workflows
 */
class DataProcessor {
  constructor(options = {}) {
    this.logger = options.logger || new Logger(options.logging);
    this.cache = options.cache || null;
    this.sources = new Map();
    this.transformers = new Map();
    this.importers = new Map();

    // Validate and set configuration immediately
    this.config = this._validateConfig(options.config || {});

    // Cache for processed sources to avoid reprocessing dependencies
    this.processedSources = new Map();

    // Progress tracking
    this.processingStats = this._initStats();

    this.logger.info("DataProcessor initialized successfully");
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration object to validate
   * @returns {Object} Validated configuration with defaults applied
   * @private
   */
  _validateConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("Configuration must be an object");
    }

    if (config.sources) {
      for (const [name, sourceConfig] of Object.entries(config.sources)) {
        if (typeof sourceConfig.enabled !== "boolean") {
          throw new Error(
            `Source '${name}' must have an enabled boolean property`
          );
        }
      }
    }

    return this._applyDefaults(config);
  }

  /**
   * Apply default values to configuration
   * @param {Object} config - Configuration object
   * @returns {Object} Configuration with defaults applied
   * @private
   */
  _applyDefaults(config) {
    return {
      sources: config.sources || {},
      cache: {
        enabled: true,
        path: "./cache",
        ...config.cache,
      },
      ...config,
    };
  }

  /**
   * Initialize processing statistics
   * @returns {Object} Initial processing stats
   * @private
   */
  _initStats() {
    return {
      startTime: null,
      endTime: null,
      totalSources: 0,
      processedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      skippedSources: 0,
      totalRecords: 0,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Process a specific data source with dependency resolution
   * @param {string} sourceName - Name of the source to process
   * @param {Object} options - Processing options
   * @param {Set} processingStack - Stack to detect circular dependencies
   * @returns {Promise<Object>} Processing result
   */
  async processSource(sourceName, options = {}, processingStack = new Set()) {
    // Check for circular dependencies
    if (processingStack.has(sourceName)) {
      throw new ProcessingError(
        `Circular dependency detected: ${Array.from(processingStack).join(" -> ")} -> ${sourceName}`,
        ProcessingError.Categories.SOURCE_ERROR,
        sourceName
      );
    }

    // Check if already processed (for dependency resolution)
    if (this.processedSources.has(sourceName)) {
      this.logger.debug(`Using cached result for source: ${sourceName}`);
      return this.processedSources.get(sourceName);
    }

    const startTime = Date.now();

    try {
      this.logger.info(`Starting processing for source: ${sourceName}`);
      this._updateProgress("processedSources", 1);

      const sourceConfig = this.config.sources[sourceName];
      if (!sourceConfig) {
        throw new ProcessingError(
          `Source configuration not found: ${sourceName}`,
          "CONFIG_ERROR",
          sourceName
        );
      }

      if (!sourceConfig.enabled) {
        this.logger.info(`Source ${sourceName} is disabled, skipping`);
        this._updateProgress("skippedSources", 1);
        const result = {
          source: sourceName,
          status: "skipped",
          reason: "disabled",
          processingTime: Date.now() - startTime,
        };
        this.processedSources.set(sourceName, result);
        return result;
      }

      // Add current source to processing stack
      processingStack.add(sourceName);

      // Resolve dependencies first at processor level
      const dependencies = sourceConfig.config?.dependencies || [];
      const resolvedDependencies = {};

      if (dependencies.length > 0) {
        this.logger.debug(
          `Processing ${dependencies.length} dependencies for ${sourceName}`
        );
        for (const depName of dependencies) {
          const depResult = await this.processSource(
            depName,
            options,
            processingStack
          );
          resolvedDependencies[depName] = depResult;
        }
      }

      // Remove current source from processing stack after dependencies are processed
      processingStack.delete(sourceName);

      // Create source instance without processor reference
      const sourceInstance = this._createSourceInstance(
        sourceName,
        sourceConfig
      );

      // Process the source with resolved dependencies
      const result = await this._processSourceWithInstance(
        sourceInstance,
        sourceName,
        sourceConfig,
        resolvedDependencies,
        options
      );
      result.processingTime = Date.now() - startTime;

      // Cache the result for dependency resolution
      this.processedSources.set(sourceName, result);

      this._updateProgress("successfulSources", 1);
      this._updateProgress("totalRecords", result.recordCount || 0);

      this.logger.info(
        `Completed processing for source: ${sourceName} (${result.recordCount} records in ${result.processingTime}ms)`
      );
      return result;
    } catch (error) {
      this._updateProgress("failedSources", 1);
      this._recordError(error);
      this.logger.error(`Failed to process source ${sourceName}:`, error);
      throw error;
    }
  }

  /**
   * Process all configured sources
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing summary with results
   */
  async processAll(options = {}) {
    this._resetStats();
    this.processingStats.startTime = new Date();

    try {
      this.logger.info("Starting processing for all sources");

      const results = [];
      const sourceNames = Object.keys(this.config.sources || {});
      this.processingStats.totalSources = sourceNames.length;

      this.logger.info(`Found ${sourceNames.length} configured sources`);

      for (const sourceName of sourceNames) {
        try {
          const result = await this.processSource(sourceName, options);
          results.push(result);
        } catch (error) {
          this.logger.error(
            `Failed to process source ${sourceName}, continuing with others`
          );
          results.push({
            source: sourceName,
            status: "error",
            error: error.message,
            processingTime: 0,
          });
        }
      }

      this.processingStats.endTime = new Date();
      const summary = this._generateSummary(results);

      this.logger.info("Processing completed");
      this._logSummary(summary);

      return summary;
    } catch (error) {
      this.processingStats.endTime = new Date();
      this.logger.error("Failed to process all sources:", error);
      throw error;
    }
  }

  /**
   * Register a source handler
   * @param {string} type - Source type
   * @param {Object} handler - Source handler instance
   */
  registerSource(type, handler) {
    this.sources.set(type, handler);
    this.logger.debug(`Registered source handler: ${type}`);
  }

  /**
   * Register a transformer
   * @param {string} type - Transformer type
   * @param {Object} handler - Transformer instance
   */
  registerTransformer(type, handler) {
    this.transformers.set(type, handler);
    this.logger.debug(`Registered transformer: ${type}`);
  }

  /**
   * Register an importer
   * @param {string} type - Importer type
   * @param {Object} handler - Importer instance
   */
  registerImporter(type, handler) {
    this.importers.set(type, handler);
    this.logger.debug(`Registered importer: ${type}`);
  }

  /**
   * Get current processing statistics
   * @returns {Object} Current processing stats
   */
  getProcessingStats() {
    return { ...this.processingStats };
  }

  /**
   * Create source instance with processor reference for dependency resolution
   * @param {string} sourceName - Name of the source
   * @param {Object} sourceConfig - Source configuration
   * @returns {Object} Source instance
   * @private
   */
  _createSourceInstance(sourceName, sourceConfig) {
    // Import source classes dynamically
    const sources = require("../sources");

    // Map source names to class names
    const sourceClassMap = {
      climbers: "ClimbersSource",
      teufelsturmRoutes: "TeufelsturmRoutesSource",
      teufelsturmSummits: "TeufelsturmSummitsSource",
      osmLocations: "OSMLocationsSource",
      routes: "RoutesSource",
      ascents: "AscentsSource",
    };

    const className = sourceClassMap[sourceName];
    if (!className || !sources[className]) {
      throw new ProcessingError(
        `Source class not found for: ${sourceName}`,
        ProcessingError.Categories.SOURCE_ERROR,
        sourceName
      );
    }

    const SourceClass = sources[className];
    return new SourceClass(sourceConfig.config, this.logger, this.cache);
  }

  /**
   * Process source with specific instance (supports dependencies)
   * @param {Object} sourceInstance - Source instance
   * @param {string} sourceName - Name of the source
   * @param {Object} sourceConfig - Source configuration
   * @param {Object} resolvedDependencies - Resolved dependency data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   * @private
   */
  async _processSourceWithInstance(
    sourceInstance,
    sourceName,
    sourceConfig,
    resolvedDependencies,
    options
  ) {
    // Use the source's own process method with resolved dependencies
    const processedData = await sourceInstance.process(resolvedDependencies);

    // Apply transformers if configured
    let transformedData = processedData;
    if (this.config.transformers) {
      for (const [transformerName, transformerConfig] of Object.entries(
        this.config.transformers
      )) {
        if (transformerConfig.enabled) {
          const transformer = this.transformers.get(transformerName);
          if (transformer) {
            transformedData = await transformer.transform(transformedData);
          }
        }
      }
    }

    // Import data if importers are configured
    if (this.config.importers) {
      for (const [importerName, importerConfig] of Object.entries(
        this.config.importers
      )) {
        if (importerConfig.enabled) {
          const importer = this.importers.get(importerName);
          if (importer) {
            await importer.import(transformedData);
          }
        }
      }
    }

    return {
      source: sourceName,
      status: "completed",
      data: transformedData, // Include the actual data for dependency resolution
      recordCount: this._getRecordCount(transformedData),
      processedAt: new Date(),
      ...transformedData, // Spread the processed data for dependency access
    };
  }

  /**
   * Get record count from processed data
   * @param {any} data - Processed data
   * @returns {number} Record count
   * @private
   */
  _getRecordCount(data) {
    if (Array.isArray(data)) {
      return data.length;
    }
    if (data && typeof data === "object") {
      // For objects with arrays (like our sources), count total items
      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          count += value.length;
        }
      }
      return count || 1;
    }
    return 1;
  }

  /**
   * Process source with specific handler (legacy method for backward compatibility)
   * @private
   */
  async _processSourceWithHandler(source, sourceName, sourceConfig, options) {
    // Fetch raw data
    const rawData = await source.fetch();

    // Parse data
    const parsedData = await source.parse(rawData);

    // Validate data
    const validatedData = await source.validate(parsedData);

    // Apply transformers if configured
    let transformedData = validatedData;
    if (this.config.transformers) {
      for (const [transformerName, transformerConfig] of Object.entries(
        this.config.transformers
      )) {
        if (transformerConfig.enabled) {
          const transformer = this.transformers.get(transformerName);
          if (transformer) {
            transformedData = await transformer.transform(transformedData);
          }
        }
      }
    }

    // Import data if importers are configured
    if (this.config.importers) {
      for (const [importerName, importerConfig] of Object.entries(
        this.config.importers
      )) {
        if (importerConfig.enabled) {
          const importer = this.importers.get(importerName);
          if (importer) {
            await importer.import(transformedData);
          }
        }
      }
    }

    return {
      source: sourceName,
      status: "completed",
      recordCount: Array.isArray(transformedData) ? transformedData.length : 1,
      processedAt: new Date(),
    };
  }

  /**
   * Reset processing statistics
   * @private
   */
  _resetStats() {
    this.processingStats = {
      startTime: null,
      endTime: null,
      totalSources: 0,
      processedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      skippedSources: 0,
      totalRecords: 0,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Update progress counter
   * @private
   */
  _updateProgress(counter, increment) {
    this.processingStats[counter] += increment;
  }

  /**
   * Record an error in processing stats
   * @private
   */
  _recordError(error) {
    this.processingStats.errors.push({
      message: error.message,
      category: error.category || "UNKNOWN",
      source: error.source || "UNKNOWN",
      timestamp: new Date(),
    });
  }

  /**
   * Record a warning in processing stats
   * @private
   */
  _recordWarning(message, source = "UNKNOWN") {
    this.processingStats.warnings.push({
      message,
      source,
      timestamp: new Date(),
    });
  }

  /**
   * Generate processing summary
   * @private
   */
  _generateSummary(results) {
    const totalTime =
      this.processingStats.endTime - this.processingStats.startTime;

    return {
      summary: {
        totalSources: this.processingStats.totalSources,
        processedSources: this.processingStats.processedSources,
        successfulSources: this.processingStats.successfulSources,
        failedSources: this.processingStats.failedSources,
        skippedSources: this.processingStats.skippedSources,
        totalRecords: this.processingStats.totalRecords,
        totalProcessingTime: totalTime,
        averageTimePerSource:
          this.processingStats.totalSources > 0
            ? totalTime / this.processingStats.totalSources
            : 0,
        errorCount: this.processingStats.errors.length,
        warningCount: this.processingStats.warnings.length,
      },
      results,
      errors: this.processingStats.errors,
      warnings: this.processingStats.warnings,
      startTime: this.processingStats.startTime,
      endTime: this.processingStats.endTime,
    };
  }

  /**
   * Log processing summary
   * @private
   */
  _logSummary(summary) {
    const { summary: stats } = summary;

    this.logger.info("=== Processing Summary ===");
    this.logger.info(`Total Sources: ${stats.totalSources}`);
    this.logger.info(`Successful: ${stats.successfulSources}`);
    this.logger.info(`Failed: ${stats.failedSources}`);
    this.logger.info(`Skipped: ${stats.skippedSources}`);
    this.logger.info(`Total Records: ${stats.totalRecords}`);
    this.logger.info(`Total Time: ${stats.totalProcessingTime}ms`);
    this.logger.info(
      `Average Time per Source: ${Math.round(stats.averageTimePerSource)}ms`
    );

    if (stats.errorCount > 0) {
      this.logger.warn(`Errors: ${stats.errorCount}`);
    }

    if (stats.warningCount > 0) {
      this.logger.warn(`Warnings: ${stats.warningCount}`);
    }

    this.logger.info("========================");
  }
}

module.exports = DataProcessor;
