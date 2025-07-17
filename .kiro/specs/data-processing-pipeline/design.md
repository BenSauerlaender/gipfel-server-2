# Design Document

## Overview

The data processing system will be restructured into a flexible, maintainable framework that handles various data sources (Teufelsturm, OSM, climbing data) and processes them into a consistent database format. The design emphasizes modularity, clear separation of concerns, and ease of maintenance while keeping the system flexible for a beta project.

## Architecture

### Core Principles

- **Modular Design**: Each data source and processing type has its own handler
- **Configuration-Driven**: Processing behavior controlled through configuration files
- **Flexible Pipeline**: Support for different processing workflows without rigid stages
- **Error Resilience**: Graceful handling of failures with detailed logging
- **Incremental Processing**: Support for both full and partial data updates

### Directory Structure

```
data-processing/
├── config/
│   └── config.json           # Main configuration file
├── lib/
│   ├── core/
│   │   ├── processor.js      # Main processing orchestrator
│   │   ├── logger.js         # Centralized logging
│   │   ├── error.js          # Custom error classes
│   │   ├── simple-cache.js   # Simple file-based cache
│   │   └── index.js          # Core module exports
│   ├── sources/
│   │   ├── base-source.js    # Base class for data sources
│   │   ├── climbers-source.js        # Climbers data handler
│   │   ├── teufelsturm-routes-source.js    # Teufelsturm routes handler
│   │   ├── teufelsturm-summits-source.js   # Teufelsturm summits handler
│   │   ├── osm-locations-source.js         # OSM locations handler
│   │   └── index.js          # Sources module exports
│   ├── transformers/
│   │   ├── base-transformer.js
│   │   └── index.js
│   ├── importers/
│   │   ├── base-importer.js
│   │   └── index.js
│   └── util/
│       ├── fixSummitName.js  # Summit name normalization utility
│       └── index.js
├── examples/
│   ├── processor-example.js          # DataProcessor usage examples
│   ├── climbers-source-example.js    # ClimbersSource example
│   ├── osm-locations-with-dependencies-example.js  # Dependency example
│   └── [other source examples]
├── tests/
│   ├── core/
│   │   ├── processor.test.js         # DataProcessor tests
│   │   └── simple-cache.test.js      # Cache tests
│   ├── sources/
│   │   ├── climbers-source.test.js   # ClimbersSource tests
│   │   └── [other source tests]
│   ├── integration/
│   │   └── dependency-resolution.test.js  # Integration tests
│   ├── fixtures/                     # Test data files
│   └── utils/                        # Test utilities
├── cache/                    # Simple cache storage (JSON files)
└── [input/output directories as needed]
```

## Components and Interfaces

### Core Processor

The main orchestrator that coordinates data processing workflows.

```javascript
class DataProcessor {
  constructor(config) {
    this.config = config;
    this.logger = new Logger();
    this.sources = new Map();
    this.transformers = new Map();
    this.importers = new Map();
  }

  async processSource(sourceName, options = {}) {
    // Process a specific data source
  }

  async processAll(options = {}) {
    // Process all configured sources
  }
}
```

### Data Source Interface

Base interface for all data source handlers with simple file-based caching support.

```javascript
class BaseSource {
  constructor(config, logger, cache) {
    this.config = config;
    this.logger = logger;
    this.cache = cache;
    this.cacheEnabled = config.cache?.enabled ?? true;
  }

  async fetch() {
    // Fetch/load raw data
    throw new Error("fetch() must be implemented");
  }

  async parse(rawData) {
    // Parse raw data into structured format
    throw new Error("parse() must be implemented");
  }

  async validate(parsedData) {
    // Validate parsed data
    return parsedData;
  }

  async process() {
    const cacheKey = this.getCacheKey();

    // Check cache first
    if (this.cacheEnabled) {
      // Check if source files are newer than cache
      const sourceFiles = this.getSourceFiles();
      const isSourceNewer = await this.cache.isSourceNewer(
        cacheKey,
        sourceFiles
      );

      if (!isSourceNewer) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached data for ${this.constructor.name}`);
          return cached;
        }
      }
    }

    // Process data
    const rawData = await this.fetch();
    const parsedData = await this.parse(rawData);
    const validatedData = await this.validate(parsedData);

    // Cache result
    if (this.cacheEnabled) {
      await this.cache.set(cacheKey, validatedData);
    }

    return validatedData;
  }

  getCacheKey() {
    // Generate cache key based on source type and config hash
    const configHash = require("crypto")
      .createHash("md5")
      .update(JSON.stringify(this.config))
      .digest("hex")
      .substring(0, 8);
    return `${this.constructor.name.toLowerCase()}_${configHash}`;
  }

  getSourceFiles() {
    // Return array of source files that this processor depends on
    // Override in subclasses to specify actual source files
    return this.config.inputFiles || [];
  }

  async clearCache() {
    const cacheKey = this.getCacheKey();
    await this.cache.invalidate(cacheKey);
  }
}
```

### Transformer Interface

Base interface for data transformation operations (currently not implemented - transformations are handled within source classes).

```javascript
class BaseTransformer {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async transform(data) {
    // Transform data
    throw new Error("transform() must be implemented");
  }
}
```

### Importer Interface

Base interface for data import operations.

```javascript
class BaseImporter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async import(data) {
    // Import data to destination
    throw new Error("import() must be implemented");
  }
}
```

## Data Models

### Processing Configuration

```json
{
  "sources": {
    "climbers": {
      "enabled": true,
      "config": {
        "inputFile": "input/climbers.json"
      }
    },
    "teufelsturmRoutes": {
      "enabled": true,
      "config": {
        "inputFiles": [
          "input/teufelsturm/wege1.html",
          "input/teufelsturm/wege2.html"
        ]
      }
    },
    "teufelsturmSummits": {
      "enabled": true,
      "config": {
        "inputFiles": [
          "input/teufelsturm/wege1.html",
          "input/teufelsturm/wege2.html"
        ]
      }
    },
    "osmLocations": {
      "enabled": true,
      "config": {
        "inputFile": "input/points.geojson",
        "dependencies": ["teufelsturmSummits"]
      }
    },
    "routes": {
      "enabled": true,
      "config": {
        "inputFile": "input/routes.json"
      }
    },
    "ascents": {
      "enabled": true,
      "config": {
        "inputFile": "input/ascents.json"
      }
    }
  },
  "transformers": {},
  "importers": {
    "database": {
      "enabled": true,
      "config": {
        "collections": {
          "regions": ["teufelsturmSummits", "regions"],
          "summits": ["teufelsturmSummits", "routes", "osmLocations"],
          "routes": ["teufelsturmRoutes", "routes"],
          "climbers": ["climbers"],
          "ascents": ["ascents"]
        }
      }
    }
  },
  "cache": {
    "enabled": true,
    "path": "./cache"
  },
  "logging": {
    "level": "info",
    "file": {
      "enabled": false,
      "path": "./logs/processing.log"
    }
  }
}
```

### Data Flow Models

```javascript
// Standardized data format between processing steps
const ProcessingResult = {
  source: "string", // Source identifier
  type: "string", // Data type (regions, summits, routes, etc.)
  data: [], // Processed data array
  metadata: {
    processedAt: "Date",
    recordCount: "number",
    errors: [],
    warnings: [],
  },
};
```

## Error Handling

### Error Categories

- **Source Errors**: Issues with fetching/loading data
- **Parse Errors**: Problems parsing raw data
- **Validation Errors**: Data that doesn't meet validation criteria
- **Transform Errors**: Issues during data transformation
- **Import Errors**: Problems importing to database

### Error Handling Strategy

```javascript
class ProcessingError extends Error {
  constructor(message, category, source, details = {}) {
    super(message);
    this.category = category;
    this.source = source;
    this.details = details;
    this.timestamp = new Date();
  }
}
```

### Logging Strategy

- **Debug**: Detailed processing steps
- **Info**: Progress updates and summaries
- **Warn**: Non-fatal issues that should be reviewed
- **Error**: Fatal errors that prevent processing
- **Summary**: Final processing results and statistics

## Testing Strategy

### Unit Testing

- Test each source handler independently
- Test transformers with known input/output pairs
- Test validators with valid and invalid data
- Mock external dependencies (files, network, database)

### Integration Testing

- Test complete processing workflows
- Test error handling and recovery
- Test configuration loading and validation
- Test with real data samples

### Test Data Management

```
tests/
├── fixtures/
│   ├── teufelsturm-sample.html
│   ├── osm-sample.geojson
│   └── expected-outputs/
├── unit/
│   ├── sources/
│   ├── transformers/
│   └── importers/
└── integration/
    ├── full-pipeline.test.js
    └── error-scenarios.test.js
```

## Migration Strategy

### Phase 1: Core Framework

- Implement base classes and interfaces
- Create configuration system
- Set up logging and error handling
- Migrate one simple data source (e.g., climbers)

### Phase 2: Complex Sources

- Migrate Teufelsturm route processing
- Migrate OSM location processing
- Implement location matching transformer

### Phase 3: Database Integration

- Migrate database import functionality
- Implement incremental update logic
- Add validation and error recovery

### Phase 4: Enhancement

- Add performance monitoring
- Implement parallel processing where beneficial
- Add comprehensive testing
- Create documentation and examples

## Configuration Management

### Environment-Specific Configs

```
config/
├── base.json              # Base configuration
├── development.json       # Development overrides
├── production.json        # Production overrides
└── sources/
    ├── teufelsturm.json   # Teufelsturm-specific config
    └── osm.json           # OSM-specific config
```

### Configuration Loading

```javascript
class ConfigManager {
  static load(environment = "development") {
    const base = require("./config/base.json");
    const env = require(`./config/${environment}.json`);
    return this.merge(base, env);
  }
}
```

### Cache Configuration

```json
{
  "cache": {
    "enabled": true,
    "path": "./cache"
  }
}
```

## Performance Considerations

### Memory Management

- Stream processing for large files
- Batch processing for database operations
- Cleanup of temporary data

### Parallel Processing

- Process independent data sources concurrently
- Batch database operations
- Use worker threads for CPU-intensive parsing

### Enhanced File-Based Caching

The system implements a flexible file-based caching mechanism with support for sub-caches and pattern-based cache management to avoid redundant processing while keeping complexity minimal.

#### Cache Architecture

The caching system is built into the BaseSource class and provides:

- **Main Cache**: Primary cache for processed data
- **Sub-Caches**: Categorized cache entries (e.g., summits, routes, regions)
- **Pattern-Based Clearing**: Ability to clear multiple related cache entries
- **Source File Dependency Tracking**: Automatic cache invalidation when source files change

#### BaseSource Cache Integration

```javascript
class BaseSource {
  constructor(config, logger, cache = null) {
    this.config = config;
    this.logger = logger;
    this.sourceName = this.constructor.name;
    this.cache = cache;
    this.cacheEnabled = config.cache?.enabled ?? true;
  }

  // Generate cache key based on source configuration
  getCacheKey() {
    const configHash = crypto
      .createHash("md5")
      .update(JSON.stringify(this.config))
      .digest("hex")
      .substring(0, 8);

    return `${this.sourceName.toLowerCase()}_${configHash}`;
  }

  // Generate cache key that includes dependency versions
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

  // Check if any dependency data is newer than cached data
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

  // Clear cache for this source
  async clearCache() {
    if (this.cache) {
      const cacheKey = this.getCacheKey();
      await this.cache.invalidate(cacheKey);
      this.logger.info(`Cleared cache for ${this.sourceName}: ${cacheKey}`);
    }
  }
}
```

#### Enhanced SimpleCache Implementation

```javascript
class SimpleCache {
  constructor(config) {
    this.cacheDir = config.cacheDir || "./cache";
    this.logger = config.logger;
  }

  // Basic cache operations
  async get(key) {
    /* ... */
  }
  async set(key, data) {
    /* ... */
  }
  async invalidate(key) {
    /* ... */
  }
  async clear() {
    /* ... */
  }

  // Enhanced pattern-based operations
  async findKeys(pattern) {
    // Find all cache keys matching pattern (supports wildcards)
    const files = await fs.readdir(this.cacheDir);
    const keys = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));

    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${regexPattern}$`);

    return keys.filter((key) => regex.test(key));
  }

  async invalidateByPattern(pattern) {
    // Clear multiple cache entries by pattern
    const matchingKeys = await this.findKeys(pattern);
    let invalidatedCount = 0;

    for (const key of matchingKeys) {
      await this.invalidate(key);
      invalidatedCount++;
    }

    return invalidatedCount;
  }

  // Source file dependency checking
  async isSourceNewer(key, sourceFiles) {
    /* ... */
  }
}
```

#### Cache Usage Examples

```javascript
// Basic caching in source processing
const result = await source.process(); // Automatically cached

// Dependency-aware caching
const cacheKey = source.getCacheKeyWithDependencies(dependencies);
const cached = await cache.get(cacheKey);

// Cache management
await source.clearCache(); // Clear cache for specific source
await cache.clear(); // Clear all cache entries
await cache.invalidateByPattern("teufelsturm*"); // Clear all Teufelsturm-related caches
```
