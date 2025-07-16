const OSMLocationsSource = require("../lib/sources/osm-locations-source");
const SimpleCache = require("../lib/core/simple-cache");

/**
 * Simple example demonstrating OSMLocationsSource usage
 */
async function main() {
  console.log("=== OSM Locations Example ===\n");

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

  // Simple configuration
  const config = {
    inputFile: "../data-proccessing/input/points.geojson",
  };

  try {
    const source = new OSMLocationsSource(config, logger, cache);

    // Process the data
    const result = await source.process();

    // Display results
    console.log("\n=== Results ===");
    console.log(`Locations: ${result.locations.length}`);
    console.log(`Processed at: ${result.metadata.processedAt}`);

    // Show sample data
    console.log("\n=== Sample Locations ===");
    result.locations.slice(0, 2).forEach((location) => {
      const name = location.properties?.name || "Unnamed";
      console.log(`- ${name}`);
    });

    // Test caching
    console.log("\n=== Cache Test ===");
    await source.process(); // Should use cache
  } catch (error) {
    console.error("Error:", error.message);
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
