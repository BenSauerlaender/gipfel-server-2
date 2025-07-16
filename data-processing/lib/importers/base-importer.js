const ProcessingError = require('../core/error');

/**
 * Base class for all data importers
 */
class BaseImporter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.importerName = this.constructor.name;
  }

  /**
   * Import data to destination
   * Must be implemented by subclasses
   * @param {any} data - Data to import
   * @returns {Promise<Object>} Import result with statistics
   * @throws {ProcessingError} When import operation fails
   */
  async import(data) {
    throw new ProcessingError(
      'import() method must be implemented by subclass',
      ProcessingError.Categories.IMPORT_ERROR,
      this.importerName
    );
  }

  /**
   * Validate data before import
   * @param {any} data - Data to validate
   * @returns {Promise<boolean>} True if data is valid for import
   * @throws {ProcessingError} When validation fails
   */
  async validateData(data) {
    this.logger.debug(`Validating data for import in ${this.importerName}`);
    
    if (data === null || data === undefined) {
      throw new ProcessingError(
        'Import data is null or undefined',
        ProcessingError.Categories.VALIDATION_ERROR,
        this.importerName
      );
    }

    return true;
  }

  /**
   * Prepare data for import (preprocessing step)
   * Default implementation returns data as-is
   * Can be overridden by subclasses
   * @param {any} data - Data to prepare
   * @returns {Promise<any>} Prepared data
   */
  async prepareData(data) {
    this.logger.debug(`Preparing data for import in ${this.importerName}`);
    return data;
  }

  /**
   * Post-import cleanup or verification
   * Default implementation does nothing
   * Can be overridden by subclasses
   * @param {Object} importResult - Result from import operation
   * @returns {Promise<void>}
   */
  async postImport(importResult) {
    this.logger.debug(`Post-import processing in ${this.importerName}`, importResult);
  }

  /**
   * Get importer metadata
   * @returns {Object} Importer metadata
   */
  getMetadata() {
    return {
      importerName: this.importerName,
      config: this.config,
      timestamp: new Date()
    };
  }

  /**
   * Log import progress
   * @param {string} message - Progress message
   * @param {Object} details - Additional details
   */
  logProgress(message, details = {}) {
    this.logger.info(`[${this.importerName}] ${message}`, details);
  }

  /**
   * Log import error
   * @param {Error} error - Error that occurred
   * @param {Object} details - Additional details
   */
  logError(error, details = {}) {
    this.logger.error(`[${this.importerName}] ${error.message}`, {
      error: error.stack,
      ...details
    });
  }

  /**
   * Execute full import process with validation and cleanup
   * @param {any} data - Data to import
   * @returns {Promise<Object>} Import result
   */
  async executeImport(data) {
    try {
      this.logProgress('Starting import process');
      
      // Validate data
      await this.validateData(data);
      
      // Prepare data
      const preparedData = await this.prepareData(data);
      
      // Import data
      const importResult = await this.import(preparedData);
      
      // Post-import processing
      await this.postImport(importResult);
      
      this.logProgress('Import process completed', importResult);
      return importResult;
      
    } catch (error) {
      this.logError(error);
      throw error;
    }
  }

  /**
   * Create standard import result object
   * @param {number} inserted - Number of records inserted
   * @param {number} updated - Number of records updated
   * @param {number} skipped - Number of records skipped
   * @param {Array} errors - Array of errors encountered
   * @returns {Object} Standard import result
   */
  createImportResult(inserted = 0, updated = 0, skipped = 0, errors = []) {
    return {
      inserted,
      updated,
      skipped,
      errors,
      total: inserted + updated + skipped,
      timestamp: new Date(),
      importer: this.importerName
    };
  }
}

module.exports = BaseImporter;