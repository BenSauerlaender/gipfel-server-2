require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const generateMongoUri = require("../../src/utill/mongoUri");

// Import models
const Region = require("../../src/models/Region");
const Summit = require("../../src/models/Summit");
const Route = require("../../src/models/Route");
const Climber = require("../../src/models/Climber");
const Ascent = require("../../src/models/Ascent");
const LastChange = require("../../src/models/LastChange");

class DatabaseExporter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.connection = null;
    this.models = {
      regions: Region,
      summits: Summit,
      routes: Route,
      climbers: Climber,
      ascents: Ascent,
    };
  }

  async connect() {
    if (this.connection) return;

    const mongoUri = generateMongoUri(this.config.database);
    this.logger.info(`Connecting to MongoDB: ${this.config.database}`);

    this.connection = await mongoose.connect(mongoUri);
    this.logger.info("Connected to MongoDB successfully");
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      this.logger.info("Disconnected from MongoDB");
    }
  }

  async export(dependencies) {
    const exportStats = {};

    try {
      await this.connect();
      this.logger.info(`Exporting data to database...`);

      for (const [collectionName, dataSources] of Object.entries(
        this.config.collections
      )) {
        const stats = await this.processCollection(
          collectionName,
          dataSources,
          dependencies
        );
        exportStats[collectionName] = stats;
      }

      // Generate overall summary table
      this.generateExportSummary(exportStats);

      this.logger.info(`Data export completed successfully.`);
    } catch (error) {
      this.logger.error("Database export failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  async processCollection(collectionName, dataSources, dependencies) {
    const collectionLogger = this.logger.child(collectionName);
    collectionLogger.info(`Processing collection: ${collectionName}`);

    const stats = {
      inserted: 0,
      updated: 0,
      replaced: 0,
      skipped: 0,
      failed: 0,
      sources: {}, // Track individual source statistics
    };

    for (const dataSource of dataSources) {
      if (typeof dataSource === "string") {
        // Regular data source
        const sourceStats = await this.processDataSource(
          collectionName,
          dataSource,
          dependencies,
          collectionLogger
        );
        stats.inserted += sourceStats.inserted;
        stats.updated += sourceStats.updated;
        stats.replaced += sourceStats.replaced;
        stats.skipped += sourceStats.skipped;
        stats.failed += sourceStats.failed;
        stats.sources[dataSource] = sourceStats;
      } else if (dataSource.type === "gpsLocation") {
        // Special GPS location handling
        const gpsStats = await this.processGpsLocations(
          collectionName,
          dataSource.dependency,
          dependencies,
          collectionLogger
        );
        stats.updated += gpsStats.updated;
        stats.skipped += gpsStats.skipped;
        stats.failed += gpsStats.failed;
        stats.sources[`${dataSource.dependency} (GPS)`] = {
          inserted: 0,
          updated: gpsStats.updated,
          replaced: 0,
          skipped: gpsStats.skipped,
          failed: gpsStats.failed,
        };
      }
    }

    // Update the LastChange collection if the collection was modified
    if (stats.inserted > 0 || stats.updated > 0 || stats.replaced > 0) {
      await this.updateLastChange(collectionName);
    }

    // Summary table
    collectionLogger.summary(`Collection ${collectionName} Summary:`);
    collectionLogger.summary("┌─────────────┬───────┐");
    collectionLogger.summary("│ Operation   │ Count │");
    collectionLogger.summary("├─────────────┼───────┤");
    collectionLogger.summary(
      `│ Inserted    │ ${stats.inserted.toString().padStart(5)} │`
    );
    collectionLogger.summary(
      `│ Updated     │ ${stats.updated.toString().padStart(5)} │`
    );
    collectionLogger.summary(
      `│ Replaced    │ ${stats.replaced.toString().padStart(5)} │`
    );
    collectionLogger.summary(
      `│ Skipped     │ ${stats.skipped.toString().padStart(5)} │`
    );
    collectionLogger.summary(
      `│ Failed      │ ${stats.failed.toString().padStart(5)} │`
    );
    collectionLogger.summary("├─────────────┼───────┤");
    collectionLogger.summary(
      `│ Total       │ ${(stats.inserted + stats.updated + stats.replaced + stats.skipped + stats.failed).toString().padStart(5)} │`
    );
    collectionLogger.summary("└─────────────┴───────┘");

    return stats;
  }

  async processDataSource(
    collectionName,
    sourceName,
    dependencies,
    logger = this.logger
  ) {
    const sourceData = dependencies[sourceName];
    if (!sourceData) {
      logger.warn(`No data found for source: ${sourceName}`);
      return { inserted: 0, updated: 0, replaced: 0, skipped: 0, failed: 0 };
    }

    const Model = this.models[collectionName];
    if (!Model) {
      logger.error(`No model found for collection: ${collectionName}`);
      return { inserted: 0, updated: 0, replaced: 0, skipped: 0, failed: 0 };
    }

    const dataKey = collectionName; // Get the main data key (e.g., 'summits', 'routes')
    this.logger.debug(`Getting ${dataKey} from source: ${sourceName}`);
    const items = sourceData.data[dataKey] || [];

    logger.info(
      `Processing ${items.length} items from ${sourceName} for ${collectionName}`
    );

    const stats = {
      inserted: 0,
      updated: 0,
      replaced: 0,
      skipped: 0,
      failed: 0,
    };

    for (const item of items) {
      try {
        const result = await this.processItem(
          Model,
          item,
          collectionName,
          logger
        );
        stats[result]++;
      } catch (error) {
        stats.failed++;
        logger.warn(
          `Failed to process item from ${sourceName}:`,
          error.message
        );
      }
    }

    logger.info(`Source ${sourceName} processing complete:`, stats);
    return stats;
  }

  async processGpsLocations(
    collectionName,
    sourceName,
    dependencies,
    logger = this.logger
  ) {
    const sourceData = dependencies[sourceName];
    if (!sourceData) {
      logger.warn(`No GPS data found for source: ${sourceName}`);
      return { updated: 0, skipped: 0, failed: 0 };
    }

    this.logger.debug(`Getting summits from source: ${sourceName}`);
    const gpsItems = sourceData.data.summits || [];
    logger.info(
      `Processing ${gpsItems.length} GPS locations for ${collectionName}`
    );

    const stats = {
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    for (const gpsItem of gpsItems) {
      try {
        const result = await this.updateSummitGpsLocation(gpsItem, logger);
        stats[result]++;
      } catch (error) {
        stats.failed++;
        logger.warn(`Failed to update GPS location:`, error.message);
      }
    }

    logger.info(`GPS locations processing complete:`, stats);
    return stats;
  }

  async updateSummitGpsLocation(gpsItem, logger = this.logger) {
    const summit = await Summit.findOne({ name: gpsItem.name });
    if (!summit) {
      logger.warn(`Summit not found for GPS update: ${gpsItem.name}`);
      return "skipped";
    }

    const shouldUpdate =
      this.config.mode === "insert"
        ? !summit.gpsPosition ||
          (!summit.gpsPosition.lat && !summit.gpsPosition.lng)
        : true;

    if (shouldUpdate && gpsItem.gpsPosition) {
      const newGpsPosition = {
        lng: gpsItem.gpsPosition.lng,
        lat: gpsItem.gpsPosition.lat,
      };

      // Check if GPS position actually changed
      const hasChanges =
        !summit.gpsPosition ||
        summit.gpsPosition.lng !== newGpsPosition.lng ||
        summit.gpsPosition.lat !== newGpsPosition.lat;

      console.log(summit.gpsPosition, newGpsPosition, hasChanges);

      if (hasChanges) {
        await Summit.updateOne(
          { _id: summit._id },
          {
            $set: {
              gpsPosition: newGpsPosition,
            },
          }
        );
        logger.debug(`Updated GPS position for summit: ${gpsItem.name}`);
        return "updated";
      } else {
        logger.debug(`GPS position unchanged for summit: ${gpsItem.name}`);
        return "skipped";
      }
    }

    return "skipped";
  }

  async processItem(Model, item, collectionName, logger = this.logger) {
    // Resolve foreign keys
    const resolvedItem = await this.resolveForeignKeys(
      item,
      collectionName,
      logger
    );
    if (!resolvedItem) return "failed"; // Skip if foreign key resolution failed

    // Find existing document
    const existingDoc = await this.findExistingDocument(
      Model,
      resolvedItem,
      collectionName
    );

    switch (this.config.mode) {
      case "insert":
        if (!existingDoc) {
          await new Model(resolvedItem).save();
          logger.debug(
            `Inserted new ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
          );
          return "inserted";
        } else {
          return "skipped";
        }

      case "replace":
        if (existingDoc) {
          await Model.replaceOne({ _id: existingDoc._id }, resolvedItem);
          logger.debug(
            `Replaced ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
          );
          return "replaced";
        } else {
          await new Model(resolvedItem).save();
          logger.debug(
            `Inserted new ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
          );
          return "inserted";
        }

      case "update":
        if (existingDoc) {
          // Check if the document actually needs updating
          const hasChanges = this.hasDocumentChanges(
            existingDoc,
            resolvedItem,
            collectionName
          );
          if (hasChanges) {
            await Model.updateOne(
              { _id: existingDoc._id },
              { $set: resolvedItem }
            );
            logger.debug(
              `Updated ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
            );
            return "updated";
          } else {
            logger.debug(
              `No changes for ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
            );
            return "skipped";
          }
        } else {
          await new Model(resolvedItem).save();
          logger.debug(
            `Inserted new ${collectionName.slice(0, -1)}: ${this.getIdentifier(resolvedItem, collectionName)}`
          );
          return "inserted";
        }

      default:
        return "failed";
    }
  }

  async findExistingDocument(Model, item, collectionName) {
    const query = this.buildIdentificationQuery(item, collectionName);
    return await Model.findOne(query);
  }

  buildIdentificationQuery(item, collectionName) {
    switch (collectionName) {
      case "ascents":
        return { date: item.date };

      case "climbers":
        return { firstName: item.firstName, lastName: item.lastName };

      case "regions":
        return { name: item.name };

      case "routes":
        return { name: item.name, summit: item.summit };

      case "summits":
        return { name: item.name, region: item.region };

      default:
        throw new Error(
          `Unknown collection for identification: ${collectionName}`
        );
    }
  }

  hasDocumentChanges(existingDoc, newData, collectionName) {
    // Convert Mongoose document to plain object for comparison
    const existing = existingDoc.toObject();

    // Remove fields that shouldn't be compared (_id, __v, createdAt, updatedAt)
    const excludeFields = ["_id", "__v", "createdAt", "updatedAt"];
    const cleanExisting = { ...existing };
    const cleanNew = { ...newData };

    excludeFields.forEach((field) => {
      delete cleanExisting[field];
      delete cleanNew[field];
    });

    Object.keys(newData).forEach((key) => {
      if (!this.deepEqual(cleanNew[key], cleanExisting[key])) return false;
      return true;
    });
  }
  // Deep comparison function
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;

    if (obj1 == null || obj2 == null) return obj1 === obj2;

    if (typeof obj1 !== "object" || typeof obj2 !== "object") {
      return obj1 === obj2;
    }

    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) return false;
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i])) return false;
      }
      return true;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (let key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }

  async resolveForeignKeys(item, collectionName, logger = this.logger) {
    const resolvedItem = { ...item };

    try {
      switch (collectionName) {
        case "ascents":
          // Resolve route
          if (item.route && item.summit) {
            const summit = await Summit.findOne({ name: item.summit });
            if (!summit) {
              logger.warn(`Summit not found: ${item.summit}`);
              return null;
            }
            const summitId = summit._id;
            const route = await Route.findOne({
              name: item.route,
              summit: summitId,
            });
            if (!route) {
              logger.warn(
                `Route not found: ${item.route} on summit: ${item.summit}`
              );
              return null;
            }
            resolvedItem.route = route._id;
          } else if (item.route) {
            logger.warn(
              `Route/Summit information missing for route: ${item.route}`
            );
            return null;
          }

          // Resolve climbers
          if (item.climbers && Array.isArray(item.climbers)) {
            const resolvedClimbers = [];
            for (const climberEntry of item.climbers) {
              const climber = await Climber.findOne({
                firstName: climberEntry.climber.firstName,
                lastName: climberEntry.climber.lastName,
              });
              if (!climber) {
                logger.warn(
                  `Climber not found: ${climberEntry.climber.firstName} ${climberEntry.climber.lastName}`
                );
                continue;
              }
              resolvedClimbers.push({
                climber: climber._id,
                isAborted: climberEntry.isAborted,
              });
            }
            resolvedItem.climbers = resolvedClimbers;
          }

          // Resolve leadClimber
          if (item.leadClimber) {
            const leadClimber = await Climber.findOne({
              firstName: item.leadClimber.firstName,
              lastName: item.leadClimber.lastName,
            });
            if (!leadClimber) {
              logger.warn(
                `Lead climber not found: ${item.leadClimber.firstName} ${item.leadClimber.lastName}`
              );
            } else {
              resolvedItem.leadClimber = leadClimber._id;
            }
          }
          break;

        case "routes":
          // Resolve summit
          if (item.summit) {
            const summit = await Summit.findOne({ name: item.summit });
            if (!summit) {
              logger.warn(`Summit not found: ${item.summit}`);
              return null;
            }
            resolvedItem.summit = summit._id;
          }
          break;

        case "summits":
          // Resolve region
          if (item.region) {
            const region = await Region.findOne({ name: item.region });
            if (!region) {
              logger.warn(`Region not found: ${item.region}`);
              return null;
            }
            resolvedItem.region = region._id;
          }
          break;
      }

      return resolvedItem;
    } catch (error) {
      logger.warn(
        `Failed to resolve foreign keys for ${collectionName}:`,
        error.message
      );
      return null;
    }
  }

  getIdentifier(item, collectionName) {
    switch (collectionName) {
      case "ascents":
        return item.date;
      case "climbers":
        return `${item.firstName} ${item.lastName}`;
      case "regions":
        return item.name;
      case "routes":
        return item.name;
      case "summits":
        return item.name;
      default:
        return "unknown";
    }
  }

  generateExportSummary(exportStats) {
    this.logger.summary(
      "═══════════════════════════════════════════════════════════════════════════════"
    );
    this.logger.summary(
      "                                EXPORT SUMMARY                                 "
    );
    this.logger.summary(
      "═══════════════════════════════════════════════════════════════════════════════"
    );

    // Calculate totals
    const totals = {
      inserted: 0,
      updated: 0,
      replaced: 0,
      skipped: 0,
      failed: 0,
    };

    Object.values(exportStats).forEach((stats) => {
      totals.inserted += stats.inserted;
      totals.updated += stats.updated;
      totals.replaced += stats.replaced;
      totals.skipped += stats.skipped;
      totals.failed += stats.failed;
    });

    const grandTotal =
      totals.inserted +
      totals.updated +
      totals.replaced +
      totals.skipped +
      totals.failed;

    // Header
    this.logger.summary(
      "┌─────────────┬─────────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐"
    );
    this.logger.summary(
      "│ Collection  │ Data Source         │ Insert  │ Update  │ Replace │ Skipped │ Failed  │  Total  │"
    );
    this.logger.summary(
      "├─────────────┼─────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤"
    );

    // Collection and source rows
    Object.entries(exportStats).forEach(([collectionName, stats]) => {
      let isFirstRow = true;

      // Show individual sources first
      Object.entries(stats.sources).forEach(([sourceName, sourceStats]) => {
        const sourceTotal =
          sourceStats.inserted +
          sourceStats.updated +
          sourceStats.replaced +
          sourceStats.skipped +
          sourceStats.failed;
        const displayCollectionName = isFirstRow
          ? collectionName.padEnd(11)
          : "".padEnd(11);

        this.logger.summary(
          `│ ${displayCollectionName} │ ${sourceName.padEnd(19)} │ ${sourceStats.inserted.toString().padStart(7)} │ ${sourceStats.updated.toString().padStart(7)} │ ${sourceStats.replaced.toString().padStart(7)} │ ${sourceStats.skipped.toString().padStart(7)} │ ${sourceStats.failed.toString().padStart(7)} │ ${sourceTotal.toString().padStart(7)} │`
        );
        isFirstRow = false;
      });

      // Collection subtotal row
      this.logger.summary(
        "├─────────────┼─────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤"
      );
    });

    // Grand totals row
    this.logger.summary(
      `│ ${"TOTAL".padEnd(11)} │ ${"ALL COLLECTIONS".padEnd(19)} │ ${totals.inserted.toString().padStart(7)} │ ${totals.updated.toString().padStart(7)} │ ${totals.replaced.toString().padStart(7)} │ ${totals.skipped.toString().padStart(7)} │ ${totals.failed.toString().padStart(7)} │ ${grandTotal.toString().padStart(7)} │`
    );

    this.logger.summary(
      "└─────────────┴─────────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘"
    );
    this.logger.summary(
      `Mode: ${this.config.mode.toUpperCase()} | Database: ${this.config.database}`
    );
    this.logger.summary(
      "═══════════════════════════════════════════════════════════════════════════════"
    );
  }

  // Add a new method to update the LastChange collection
  async updateLastChange(collectionName) {
    try {
      const now = new Date();
      await LastChange.updateOne(
        { collectionName },
        { $set: { lastModified: now } },
        { upsert: true } // Create the document if it doesn't exist
      );
      this.logger.info(`Updated LastChange for collection: ${collectionName}`);
    } catch (error) {
      this.logger.error(
        `Failed to update LastChange for collection: ${collectionName}`,
        error.message
      );
    }
  }
}

module.exports = DatabaseExporter;
