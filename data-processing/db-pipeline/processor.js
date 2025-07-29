const Logger = require("./logger");
const path = require("path");
const fs = require("fs");
const climberJsonImporter = require("./importers/climberJsonImporter");
const ascentsJsonImporter = require("./importers/ascentsJsonImporter");
const teufelsturmSummitsImporter = require("./importers/teufelsturmSummitsImporter");
const TeufelsturmRoutesImporter = require("./importers/teufelsturmRoutesImporter");
const OsmLocationsImporter = require("./importers/osmLocationsImporter");
const routesJsonImporter = require("./importers/routesJsonImporter");
const DatabaseExporter = require("./databaseExporter");
const { log } = require("console");

class DataProcessor {
  constructor(config) {
    this.config = this.resolveConfigPaths(config);
    this.logger = new Logger({
      level: this.config.logLevel || "info",
      logFile: this.config.logFile || null,
    });
    this.registeredImporters = {};
    this.importedData = {};
    this.cacheDir = this.config.cacheDir || path.resolve(__dirname, "cache");

    if (this.config.clearCacheOnStart && fs.existsSync(this.cacheDir)) {
      // Clear cache directory if configured
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      this.logger.info(`Cleared cache directory: ${this.cacheDir}`);
    }

    // Register all importers
    this.registerAllImporters();

    this.databaseExporter = new DatabaseExporter(
      this.config.databaseExporter,
      this.logger.child("DBExporter")
    );
  }

  registerImporter(name, importer) {
    this.registeredImporters[name] = importer;
    this.logger.info(`Registered importer: ${name}`);
  }

  registerAllImporters() {
    const importers = [
      {
        name: "climbersJson",
        class: climberJsonImporter,
      },
      {
        name: "ascentsJson",
        class: ascentsJsonImporter,
      },
      {
        name: "teufelsturmSummits",
        class: teufelsturmSummitsImporter,
      },
      {
        name: "teufelsturmRoutes",
        class: TeufelsturmRoutesImporter,
      },
      {
        name: "osmLocations",
        class: OsmLocationsImporter,
      },
      {
        name: "routesJson",
        class: routesJsonImporter,
      },
    ];

    importers.forEach(({ name, class: ImporterClass }) => {
      this.registerImporter(
        name,
        new ImporterClass(name, this.logger.child(name))
      );
    });
  }

  importAllData(clearCache = false) {
    this.logger.info("Starting data import process...");

    // Clear cache directory
    if (clearCache && fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      this.logger.info(`Cleared cache directory: ${this.cacheDir}`);
    }

    const configuredImporters = Object.keys(this.config.importers || {});
    if (configuredImporters.length === 0) {
      this.logger.warn("No importers configured in the data processor.");
      return;
    }
    configuredImporters.forEach((importerName) => {
      this.importData(importerName, true);
    });
    this.summaryDataImport();

    this.logger.info("Data import process completed.");
  }

  summaryDataImport() {
    this.logger.summary("Data import summary:");
    this.logger.summary("==========================");
    Object.entries(this.importedData).forEach(([name, data]) => {
      this.logger.summary(`Data for ${name}:`);
      Object.entries(data.data).forEach(([key, value]) => {
        this.logger.summary(`  Total ${key}: ${value.length}`);
      });
      this.logger.summary(`  Total warnings: ${data.metadata.warnings.length}`);
      this.logger.summary(`  Total errors: ${data.metadata.errors.length}`);
      this.logger.summary("==========================");
    });
    this.logger.summary(
      `Total importers processed: ${Object.keys(this.importedData).length}`
    );
    this.logger.summary(
      `Total warnings across all importers: ${Object.values(
        this.importedData
      ).reduce((acc, data) => acc + data.metadata.warnings.length, 0)}`
    );
    this.logger.summary(
      `Total errors across all importers: ${Object.values(
        this.importedData
      ).reduce((acc, data) => acc + data.metadata.errors.length, 0)}`
    );
    this.logger.summary("==========================");
  }

  async exportData() {
    const exporter = this.databaseExporter;
    if (!exporter) {
      throw new Error(`No database exporter registered`);
    }
    const exporterConfig = this.config.databaseExporter;
    if (!exporterConfig) {
      throw new Error(`No database exporter configuration found`);
    }

    //get dependencies
    const dependencies = {};
    if (exporterConfig.collections) {
      for (let dependency of Object.values(exporterConfig.collections).flat()) {
        if (typeof dependency === "object" && dependency !== null) {
          dependency = dependency.dependency;
        }
        if (!this.importedData[dependency]) {
          try {
            this.logger.info(`Importing dependency: ${dependency}`);
            this.importData(dependency);
          } catch (error) {
            throw new Error(`Failed to import dependency: ${dependency}`, {
              cause: error,
            });
          }
        }
        dependencies[dependency] = this.importedData[dependency];
      }
    }

    this.logger.info(`Exporting data to database...`);
    await exporter.export(dependencies);

    this.logger.info(`Data export completed successfully.`);
  }

  importData(name, supressSummary = false) {
    const importerConfig = this.config.importers[name];
    if (!importerConfig) {
      throw new Error(`No importer configuration found for: ${name}`);
    }
    const importer = this.registeredImporters[name];
    if (!importer) {
      throw new Error(`No importer registered with name: ${name}`);
    }
    this.logger.info(`Importing data for: ${name}`);

    //Check for cache
    if (this.loadDataFromCache(name)) {
      this.logger.info(`Using cached data for: ${name}`);
      return true;
    }

    // Check if dependencies are required and import them
    const dependencies = {};
    if (importerConfig.dependencies) {
      for (const dependency of importerConfig.dependencies) {
        if (!this.importedData[dependency]) {
          try {
            this.logger.info(`Importing dependency: ${dependency}`);
            this.importData(dependency);
          } catch (error) {
            throw new Error(`Failed to import dependency: ${dependency}`, {
              cause: error,
            });
          }
        }
        dependencies[dependency] = this.importedData[dependency];
      }
    }

    let importedData;
    try {
      importedData = importer.import(
        importerConfig.config,
        dependencies,
        this.logger.child(name)
      );
    } catch (error) {
      throw new Error(`Failed to import data for ${name}`, { cause: error });
    }
    if (!importedData || !importedData.data) {
      throw new Error(`No data returned from importer: ${name}`);
    }
    this.importedData[name] = importedData;
    this.saveDataToCache(name, importedData);

    this.logger.info(`Imported data for: ${name}`);
    if (!supressSummary) {
      this.logger.summary(`Data import summary for ${name}:`);
      Object.entries(importedData.data).forEach(([key, value]) => {
        this.logger.summary(`Total ${key}: ${value.length}`);
      });
      this.logger.summary(
        `Total warnings: ${importedData.metadata.warnings.length}`
      );
      this.logger.summary(
        `Total errors: ${importedData.metadata.errors.length}`
      );
    }
  }

  loadDataFromCache(name) {
    const cacheFile = path.resolve(this.cacheDir, `${name}.json`);
    try {
      const data = fs.readFileSync(cacheFile, "utf8");
      this.importedData[name] = JSON.parse(data);
      this.logger.info(`Loaded data from cache for: ${name}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to load cache for ${name}`);
      this.logger.debug(error.message, error);
      return false;
    }
  }
  saveDataToCache(name, data) {
    const cacheFile = path.resolve(this.cacheDir, `${name}.json`);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    this.logger.info(`Saved data to cache for: ${name}`);
  }

  /**
   * Resolves all file paths in the configuration relative to the processor directory.
   * @param {object} config - The configuration object
   * @returns {object} - Configuration with resolved paths
   */
  resolveConfigPaths(config) {
    const resolvedConfig = JSON.parse(JSON.stringify(config)); // Deep clone

    // Resolve cache directory path
    if (resolvedConfig.cacheDir) {
      resolvedConfig.cacheDir = path.resolve(
        __dirname,
        resolvedConfig.cacheDir
      );
    }
    if (resolvedConfig.logFile) {
      resolvedConfig.logFile = path.resolve(__dirname, resolvedConfig.logFile);
    }

    // Resolve input file paths for all importers
    if (resolvedConfig.importers) {
      Object.keys(resolvedConfig.importers).forEach((importerName) => {
        const importerConfig = resolvedConfig.importers[importerName];
        if (importerConfig.config && importerConfig.config.inputFiles) {
          importerConfig.config.inputFiles =
            importerConfig.config.inputFiles.map((filePath) =>
              path.resolve(__dirname, filePath)
            );
        }
        if (importerConfig.config && importerConfig.config.regionsAbbrMap) {
          importerConfig.config.regionsAbbrMap = path.resolve(
            __dirname,
            importerConfig.config.regionsAbbrMap
          );
        }
      });
    }

    return resolvedConfig;
  }
}

module.exports = DataProcessor;
