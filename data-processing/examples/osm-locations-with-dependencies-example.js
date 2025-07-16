const OSMLocationsSource = require("../lib/sources/osm-locations-source");
const TeufelsturmSummitsSource = require("../lib/sources/teufelsturm-summits-source");
const SimpleCache = require("../lib/core/simple-cache");

/**
 * Example demonstrating OSMLocationsSource with proper dependencies
 */
async function main() {
  console.log("=== OSM Locations with Dependencies Example ===\n");

  // Simple logger
  const logger = {
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
  };

  // Create cache
  const cache = new SimpleCache({
    cacheDir: "./cache",
    logger,
  });

  try {
    // First, get summit data from Teufelsturm source
    console.log("=== Step 1: Loading Summit Data ===");
    const summitsConfig = {
      inputFile: "../data-proccessing/output/tt.summits.html",
    };

    const summitsSource = new TeufelsturmSummitsSource(
      summitsConfig,
      logger,
      cache
    );
    const summitsResult = await summitsSource.process();

    console.log(
      `Loaded ${summitsResult.summits.length} summits from Teufelsturm`
    );

    // Now process OSM locations with summit dependencies
    console.log("\n=== Step 2: Processing OSM Locations ===");
    const osmConfig = {
      inputFile: "../data-proccessing/input/points.geojson",
    };

    const osmSource = new OSMLocationsSource(osmConfig, logger, cache);

    // Provide summit data as dependencies
    const dependencies = {
      teufelsturmSummits: summitsResult,
    };

    // Process with dependencies
    const result = await osmSource.process(dependencies);

    // Display results
    console.log("\n=== Results ===");
    console.log(`Total OSM features: ${result.metadata.totalFeatures}`);
    console.log(`Climbing points: ${result.metadata.climbingPoints}`);
    console.log(`Total summits: ${result.metadata.totalSummits}`);
    console.log(`Matched locations: ${result.locations.length}`);
    console.log(`Processed at: ${result.metadata.processedAt}`);

    // Show sample matched locations
    console.log("\n=== Sample Matched Locations ===");
    result.locations.slice(0, 5).forEach((location) => {
      console.log(`- ${location.name} (${location.region})`);
      console.log(
        `  GPS: ${location.gpsPosition.lat}, ${location.gpsPosition.lng}`
      );
    });

    // Test caching
    console.log("\n=== Cache Test ===");
    await osmSource.process(dependencies); // Should use cache
  } catch (error) {
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Run example if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Example failed:", error);
    process.exit(1);
  });
}

module.exports = { main };
