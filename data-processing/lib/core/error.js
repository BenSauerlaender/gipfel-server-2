/**
 * Custom error class for data processing operations
 */
class ProcessingError extends Error {
  constructor(message, category, source, details = {}) {
    super(message);
    this.name = 'ProcessingError';
    this.category = category;
    this.source = source;
    this.details = details;
    this.timestamp = new Date();
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProcessingError);
    }
  }

  /**
   * Convert error to JSON representation
   * @returns {Object} JSON representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      source: this.source,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Get formatted error message for logging
   * @returns {string} Formatted error message
   */
  getFormattedMessage() {
    return `[${this.category}] ${this.source}: ${this.message}`;
  }
}

/**
 * Error categories for different types of processing errors
 */
ProcessingError.Categories = {
  SOURCE_ERROR: 'SOURCE_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TRANSFORM_ERROR: 'TRANSFORM_ERROR',
  IMPORT_ERROR: 'IMPORT_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  FILE_ERROR: 'FILE_ERROR'
};

module.exports = ProcessingError;