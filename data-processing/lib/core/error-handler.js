const ProcessingError = require("./error");

/**
 * Standardized error handling utility
 */
class ErrorHandler {
  /**
   * Wrap an error in ProcessingError if needed, avoiding double-wrapping
   * @param {Error} error - Original error
   * @param {string} category - ProcessingError category
   * @param {string} sourceName - Name of the source that generated the error
   * @param {Object} context - Additional context information
   * @returns {ProcessingError} Wrapped error
   */
  static wrapError(error, category, sourceName, context = {}) {
    if (error instanceof ProcessingError) {
      return error; // Don't double-wrap
    }

    return new ProcessingError(error.message, category, sourceName, {
      ...context,
      originalError: error.message,
      stack: error.stack,
    });
  }

  /**
   * Create a standardized processing error
   * @param {string} message - Error message
   * @param {string} category - ProcessingError category
   * @param {string} sourceName - Name of the source
   * @param {Object} context - Additional context
   * @returns {ProcessingError} New processing error
   */
  static createError(message, category, sourceName, context = {}) {
    return new ProcessingError(message, category, sourceName, context);
  }
}

module.exports = ErrorHandler;
