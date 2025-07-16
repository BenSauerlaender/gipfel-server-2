const ProcessingError = require('../core/error');

/**
 * Base class for all data transformers
 */
class BaseTransformer {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.transformerName = this.constructor.name;
  }

  /**
   * Transform data
   * Must be implemented by subclasses
   * @param {any} data - Data to transform
   * @returns {Promise<any>} Transformed data
   * @throws {ProcessingError} When transformation fails
   */
  async transform(data) {
    throw new ProcessingError(
      'transform() method must be implemented by subclass',
      ProcessingError.Categories.TRANSFORM_ERROR,
      this.transformerName
    );
  }

  /**
   * Validate input data before transformation
   * @param {any} data - Input data to validate
   * @returns {Promise<boolean>} True if data is valid
   * @throws {ProcessingError} When validation fails
   */
  async validateInput(data) {
    this.logger.debug(`Validating input data for ${this.transformerName}`);
    
    if (data === null || data === undefined) {
      throw new ProcessingError(
        'Input data is null or undefined',
        ProcessingError.Categories.VALIDATION_ERROR,
        this.transformerName
      );
    }

    return true;
  }

  /**
   * Validate output data after transformation
   * @param {any} data - Output data to validate
   * @returns {Promise<boolean>} True if data is valid
   * @throws {ProcessingError} When validation fails
   */
  async validateOutput(data) {
    this.logger.debug(`Validating output data for ${this.transformerName}`);
    
    if (data === null || data === undefined) {
      throw new ProcessingError(
        'Output data is null or undefined',
        ProcessingError.Categories.VALIDATION_ERROR,
        this.transformerName
      );
    }

    return true;
  }

  /**
   * Get transformer metadata
   * @returns {Object} Transformer metadata
   */
  getMetadata() {
    return {
      transformerName: this.transformerName,
      config: this.config,
      timestamp: new Date()
    };
  }

  /**
   * Log transformation progress
   * @param {string} message - Progress message
   * @param {Object} details - Additional details
   */
  logProgress(message, details = {}) {
    this.logger.info(`[${this.transformerName}] ${message}`, details);
  }

  /**
   * Log transformation error
   * @param {Error} error - Error that occurred
   * @param {Object} details - Additional details
   */
  logError(error, details = {}) {
    this.logger.error(`[${this.transformerName}] ${error.message}`, {
      error: error.stack,
      ...details
    });
  }

  /**
   * Apply transformation with validation
   * @param {any} data - Data to transform
   * @returns {Promise<any>} Transformed and validated data
   */
  async applyTransformation(data) {
    try {
      // Validate input
      await this.validateInput(data);
      
      // Apply transformation
      const transformedData = await this.transform(data);
      
      // Validate output
      await this.validateOutput(transformedData);
      
      return transformedData;
    } catch (error) {
      this.logError(error);
      throw error;
    }
  }
}

module.exports = BaseTransformer;