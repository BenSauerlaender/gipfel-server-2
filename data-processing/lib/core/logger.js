/**
 * Centralized logging utility for the data processing system
 */
class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.prefix = options.prefix || '[DataProcessor]';
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  debug(message, ...args) {
    this._log('debug', message, ...args);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  info(message, ...args) {
    this._log('info', message, ...args);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  warn(message, ...args) {
    this._log('warn', message, ...args);
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  error(message, ...args) {
    this._log('error', message, ...args);
  }

  /**
   * Log summary information
   * @param {string} message - Log message
   * @param {...any} args - Additional arguments
   */
  summary(message, ...args) {
    this._log('info', `[SUMMARY] ${message}`, ...args);
  }

  /**
   * Internal logging method
   * @private
   */
  _log(level, message, ...args) {
    if (this.levels[level] < this.levels[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const logMessage = `${timestamp} ${levelStr} ${this.prefix} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(logMessage, ...args);
        break;
      case 'info':
        console.info(logMessage, ...args);
        break;
      case 'warn':
        console.warn(logMessage, ...args);
        break;
      case 'error':
        console.error(logMessage, ...args);
        break;
      default:
        console.log(logMessage, ...args);
    }
  }

  /**
   * Create a child logger with additional prefix
   * @param {string} childPrefix - Additional prefix for child logger
   * @returns {Logger} Child logger instance
   */
  child(childPrefix) {
    return new Logger({
      level: this.level,
      prefix: `${this.prefix}[${childPrefix}]`
    });
  }

  /**
   * Set logging level
   * @param {string} level - New logging level (debug, info, warn, error)
   */
  setLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.level = level;
    } else {
      this.warn(`Invalid log level: ${level}. Using current level: ${this.level}`);
    }
  }
}

module.exports = Logger;