const TeufelsturmSummitsSource = require("../lib/sources/teufelsturm-summits-source");
const SimpleCache = require("../lib/core/simple-cache");

/**
 * Simple example demonstrating TeufelsturmSummitsSource usage
 */
async function main() {
  console.log("=== Teufelsturm Summits Example ===\n");

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

  // Simple configuration - using the input data file
  const config = {
    inputFile: "input-data/tt.summits.html",
  };

  try {
    const source = new TeufelsturmSummitsSource(config, logger, cache);

    // Process the data
    const result = await source.process();

    // Display results
    console.log("\n=== Results ===");
    console.log(`Regions: ${result.regions.length}`);
    console.log(`Summits: ${result.summits.length}`);
    console.log(`Processed at: ${result.metadata.processedAt}`);

    // Show sample data
    console.log("\n=== Sample Summits ===");
    result.summits.slice(0, 2).forEach((summit) => {
      console.log(`- ${summit.name} (${summit.region})`);
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
