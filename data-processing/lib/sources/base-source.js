const crypto = require("crypto");
const ProcessingError = require("../core/error");

/**
 * Base class for all data source handlers
 */
class BaseSource {
  constructor(config, logger, cache = null) {
    this.config = config;
    this.logger = logger;
    this.sourceName = this.constructor.name;
    this.cache = cache;
    this.cacheEnabled = config.cache?.enabled ?? true;
  }

  /**
   * Fetch/load raw data from the source
   * Must be implemented by subclasses
   * @returns {Promise<any>} Raw data from the source
   * @throws {ProcessingError} When fetch operation fails
   */
  async fetch() {
    throw new ProcessingError(
      "fetch() method must be implemented by subclass",
      ProcessingError.Categories.SOURCE_ERROR,
      this.sourceName
    );
  }

  /**
   * Parse raw data into structured format
   * Must be implemented by subclasses
   * @param {any} rawData - Raw data from fetch()
   * @returns {Promise<any>} Parsed structured data
   * @throws {ProcessingError} When parsing fails
   */
  async parse(rawData) {
    throw new ProcessingError(
      "parse() method must be implemented by subclass",
      ProcessingError.Categories.PARSE_ERROR,
      this.sourceName
    );
  }

  /**
   * Validate parsed data
   * Default implementation returns data as-is
   * Can be overridden by subclasses for custom validation
   * @param {any} parsedData - Parsed data from parse()
   * @returns {Promise<any>} Validated data
   * @throws {ProcessingError} When validation fails
   */
  async validate(parsedData) {
    this.logger.debug(`Validating data for ${this.sourceName}`);

    if (parsedData === null || parsedData === undefined) {
      throw new ProcessingError(
        "Parsed data is null or undefined",
        ProcessingError.Categories.VALIDATION_ERROR,
        this.sourceName
      );
    }

    return parsedData;
  }

  /**
   * Get source metadata
   * @returns {Object} Source metadata
   */
  getMetadata() {
    return {
      sourceName: this.sourceName,
      config: this.config,
      timestamp: new Date(),
    };
  }

  /**
   * Log processing progress
   * @param {string} stage - Current processing stage
   * @param {string} message - Progress message
   * @param {Object} details - Additional details
   */
  logProgress(stage, message, details = {}) {
    this.logger.info(`[${this.sourceName}] ${stage}: ${message}`, details);
  }

  /**
   * Log processing error
   * @param {string} stage - Current processing stage
   * @param {Error} error - Error that occurred
   * @param {Object} details - Additional details
   */
  logError(stage, error, details = {}) {
    this.logger.error(`[${this.sourceName}] ${stage}: ${error.message}`, {
      error: error.stack,
      ...details,
    });
  }

  /**
   * Generate cache key based on source configuration
   * @returns {string} Cache key
   */
  getCacheKey() {
    const configHash = crypto
      .createHash("md5")
      .update(JSON.stringify(this.config))
      .digest("hex")
      .substring(0, 8);

    return `${this.sourceName.toLowerCase()}_${configHash}`;
  }

  /**
   * Main processing method
   * Can be overridden by subclasses for custom processing logic
   * @param {Object} dependencies - Resolved dependency data from processor
   * @returns {Promise<any>} Processed and validated data
   */
  async process(dependencies = {}) {
    this.logProgress("process", "Starting data processing");

    // Generate cache key (includes dependencies in hash)
    const cacheKey = this.getCacheKeyWithDependencies(dependencies);

    // Check cache first
    if (this.cacheEnabled && this.cache) {
      const sourceFiles = this.getSourceFiles();
      const isSourceNewer = await this.cache.isSourceNewer(
        cacheKey,
        sourceFiles
      );

      if (!isSourceNewer) {
        const cached = await this.cache.get(cacheKey);
        if (cached && !this.isDependencyNewer(cached, dependencies)) {
          this.logger.debug(`Using cached data for ${this.sourceName}`);
          return cached;
        }
      }
    }

    // Process data
    const rawData = await this.fetch(dependencies);
    const parsedData = await this.parse(rawData, dependencies);
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
   * Check if any dependency data is newer than cached data
   * @param {Object} cachedData - Previously cached data
   * @param {Object} dependencyData - Current dependency data
   * @returns {boolean} True if dependencies are newer
   */
  isDependencyNewer(cachedData, dependencyData) {
    if (!cachedData.metadata || !cachedData.metadata.processedAt) {
      return true; // No cached timestamp, consider newer
    }

    const cachedTime = new Date(cachedData.metadata.processedAt);

    for (const [depName, depData] of Object.entries(dependencyData)) {
      if (depData.metadata && depData.metadata.processedAt) {
        const depTime = new Date(depData.metadata.processedAt);
        if (depTime > cachedTime) {
          this.logger.debug(`Dependency ${depName} is newer than cache`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate cache key that includes dependency versions
   * @param {Object} dependencies - Resolved dependency data
   * @returns {string} Cache key including dependency hash
   */
  getCacheKeyWithDependencies(dependencies = {}) {
    const baseKey = this.getCacheKey();

    if (Object.keys(dependencies).length === 0) {
      return baseKey;
    }

    // Create hash of dependency metadata for cache invalidation
    const depMetadata = {};
    for (const [depName, depData] of Object.entries(dependencies)) {
      if (depData.metadata && depData.metadata.processedAt) {
        depMetadata[depName] = depData.metadata.processedAt;
      }
    }

    const depHash = crypto
      .createHash("md5")
      .update(JSON.stringify(depMetadata))
      .digest("hex")
      .substring(0, 8);

    return `${baseKey}_deps_${depHash}`;
  }

  /**
   * Get source files that this processor depends on
   * Should be implemented by subclasses that have file dependencies
   * @returns {string[]} Array of source file paths
   */
  getSourceFiles() {
    return [];
  }

  /**
   * Clear cache for this source
   * @returns {Promise<void>}
   */
  async clearCache() {
    if (this.cache) {
      const cacheKey = this.getCacheKey();
      await this.cache.invalidate(cacheKey);
      this.logger.info(`Cleared cache for ${this.sourceName}: ${cacheKey}`);
    }
  }
}

module.exports = BaseSource;
