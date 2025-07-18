const Logger = require("./logger");
const path = require("path");
const fs = require("fs");
const climberJsonImporter = require("./importers/climberJsonImporter");
const ascentsJsonImporter = require("./importers/ascentsJsonImporter");
const teufelsturmSummitsImporter = require("./importers/teufelsturmSummitsImporter");
const TeufelsturmRoutesImporter = require("./importers/teufelsturmRoutesImporter");
const OsmLocationsImporter = require("./importers/osmLocationsImporter");
const routesJsonImporter = require("./importers/routesJsonImporter");

class DataProcessor {
  constructor(config, logLevel = "info") {
    this.config = config;
    this.logger = new Logger({ level: logLevel });
    this.registeredImporters = {};
    this.importedData = {};
    this.cacheDir = path.resolve(__dirname, config.cacheDir || "cache");

    this.registerImporter(
      "climbersJson",
      new climberJsonImporter("climbersJson", this.logger)
    );
    this.registerImporter(
      "ascentsJson",
      new ascentsJsonImporter("ascentsJson", this.logger)
    );
    this.registerImporter(
      "teufelsturmSummits",
      new teufelsturmSummitsImporter("teufelsturmSummits", this.logger)
    );
    this.registerImporter(
      "teufelsturmRoutes",
      new TeufelsturmRoutesImporter("teufelsturmRoutes", this.logger)
    );
    this.registerImporter(
      "osmLocations",
      new OsmLocationsImporter("osmLocations", this.logger)
    );
    this.registerImporter(
      "routesJson",
      new routesJsonImporter("routesJson", this.logger)
    );
  }

  /**
   * Registers an importer for processing data.
   * @param {string} name - The name of the importer.
   * @param {Importer} importer - The importer that processes data.
   * @returns void
   */
  registerImporter(name, importer) {
    this.registeredImporters[name] = importer;
    this.logger.info(`Registered importer: ${name}`);
  }

  importData(name) {
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
    this.logger.summary(`Data import summary for ${name}:`);
    Object.entries(importedData.data).forEach(([key, value]) => {
      this.logger.summary(`Total ${key}: ${value.length}`);
    });
    this.logger.summary(
      `Total warnings: ${importedData.metadata.warnings.length}`
    );
    this.logger.summary(`Total errors: ${importedData.metadata.errors.length}`);
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
}

module.exports = DataProcessor;
