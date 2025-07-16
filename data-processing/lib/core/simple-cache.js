const fs = require("fs").promises;
const path = require("path");

/**
 * Simple file-based cache system with JSON storage and source file dependency checking
 */
class SimpleCache {
  constructor(config = {}) {
    this.cacheDir = config.cacheDir || "./cache";
    this.logger = config.logger || console;
  }

  /**
   * Get cached data by key
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached data or null if not found
   */
  async get(key) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      const data = await fs.readFile(cacheFile, "utf8");
      this.logger.debug(`Cache hit for ${key}`);
      return JSON.parse(data);
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger.warn(`Cache read error for ${key}:`, error.message);
      }
      this.logger.debug(`Cache miss for ${key}`);
      return null;
    }
  }

  /**
   * Set cached data by key
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @returns {Promise<void>}
   */
  async set(key, data) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
      this.logger.debug(`Cached data for ${key}`);
    } catch (error) {
      this.logger.warn(`Cache write error for ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Invalidate cached data by key
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async invalidate(key) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      await fs.unlink(cacheFile);
      this.logger.debug(`Invalidated cache for ${key}`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger.warn(`Cache invalidation error for ${key}:`, error.message);
      }
    }
  }

  /**
   * Clear all cached data
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.logger.info("Cache cleared");
    } catch (error) {
      this.logger.error("Cache clear error:", error.message);
      throw error;
    }
  }

  /**
   * Check if any source files are newer than the cached data
   * @param {string} key - Cache key
   * @param {string[]} sourceFiles - Array of source file paths to check
   * @returns {Promise<boolean>} True if any source file is newer than cache
   */
  async isSourceNewer(key, sourceFiles) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      const cacheStats = await fs.stat(cacheFile);

      for (const sourceFile of sourceFiles) {
        try {
          const sourceStats = await fs.stat(sourceFile);
          if (sourceStats.mtime > cacheStats.mtime) {
            this.logger.debug(
              `Source file ${sourceFile} is newer than cache ${key}`
            );
            return true;
          }
        } catch (error) {
          if (error.code === "ENOENT") {
            this.logger.warn(`Source file not found: ${sourceFile}`);
            // If source file doesn't exist, consider cache invalid
            return true;
          }
          throw error;
        }
      }

      this.logger.debug(`Cache ${key} is up to date with source files`);
      return false;
    } catch (error) {
      if (error.code === "ENOENT") {
        // If cache doesn't exist, source is "newer"
        this.logger.debug(
          `Cache ${key} does not exist, considering source newer`
        );
        return true;
      }
      throw error;
    }
  }

  /**
   * Get cache file path for a given key
   * @param {string} key - Cache key
   * @returns {string} Full path to cache file
   */
  getCacheFilePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Check if cache exists for a given key
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if cache exists
   */
  async exists(key) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      await fs.access(cacheFile);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cache metadata (creation time, size, etc.)
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Cache metadata or null if not found
   */
  async getMetadata(key) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      const stats = await fs.stat(cacheFile);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find all cache keys that match a pattern
   * @param {string} pattern - Pattern to match (supports wildcards with *)
   * @returns {Promise<string[]>} Array of matching cache keys
   */
  async findKeys(pattern) {
    try {
      await fs.access(this.cacheDir);
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    try {
      const files = await fs.readdir(this.cacheDir);
      const cacheFiles = files.filter((file) => file.endsWith(".json"));
      const keys = cacheFiles.map((file) => file.slice(0, -5)); // Remove .json extension

      // Convert pattern to regex
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
        .replace(/\\\*/g, ".*"); // Convert * to .*
      const regex = new RegExp(`^${regexPattern}$`);

      return keys.filter((key) => regex.test(key));
    } catch (error) {
      this.logger.error("Error finding cache keys:", error.message);
      return [];
    }
  }

  /**
   * Invalidate multiple cache entries by pattern
   * @param {string} pattern - Pattern to match (supports wildcards with *)
   * @returns {Promise<number>} Number of cache entries invalidated
   */
  async invalidateByPattern(pattern) {
    const matchingKeys = await this.findKeys(pattern);
    let invalidatedCount = 0;

    for (const key of matchingKeys) {
      try {
        await this.invalidate(key);
        invalidatedCount++;
      } catch (error) {
        this.logger.warn(
          `Failed to invalidate cache for key ${key}:`,
          error.message
        );
      }
    }

    if (invalidatedCount > 0) {
      this.logger.debug(
        `Invalidated ${invalidatedCount} cache entries matching pattern: ${pattern}`
      );
    }

    return invalidatedCount;
  }
}

module.exports = SimpleCache;
