const TeufelsturmRoutesSource = require("../lib/sources/teufelsturm-routes-source");
const SimpleCache = require("../lib/core/simple-cache");

/**
 * Simple example demonstrating TeufelsturmRoutesSource usage
 */
async function main() {
  console.log("=== Teufelsturm Routes Example ===\n");

  // Enhanced logger to capture validation errors
  const validationErrors = [];
  const logger = {
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg, details) => {
      console.warn(`[WARN] ${msg}`);
      // Capture validation errors for display
      if (msg.includes("invalid routes") && details && details.errors) {
        validationErrors.push(...details.errors);
      }
    },
    error: (msg) => console.error(`[ERROR] ${msg}`),
  };

  // Create cache
  const cache = new SimpleCache({
    cacheDir: "./cache",
    logger,
  });

  // Simple configuration
  const config = {
    inputFiles: [
      "../data-proccessing/input/teufelsturm/wege1.html",
      "../data-proccessing/input/teufelsturm/wege2.html",
    ],
  };

  try {
    const source = new TeufelsturmRoutesSource(config, logger, cache);

    // Process the data
    const result = await source.process();

    // Display results
    console.log("\n=== Results ===");
    console.log(`Regions: ${result.regions.length}`);
    console.log(`Summits: ${result.summits.length}`);
    console.log(`Routes: ${result.routes.length}`);
    console.log(`Processed at: ${result.metadata.processedAt}`);

    // Show sample data
    console.log("\n=== Sample Routes ===");
    result.routes.slice(0, 2).forEach((route) => {
      console.log(`- ${route.name} at ${route.summit}`);
      console.log(`  Difficulty: ${route.difficulty.normal || "N/A"}`);
    });

    // Show validation errors if any were captured
    if (validationErrors.length > 0) {
      console.log("\n=== Validation Errors ===");
      validationErrors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.route}`);
        console.log(`   Error: ${error.error}`);
        console.log(`   TeufelsturmId: ${error.teufelsturmId}`);
        if (error.data && error.data.difficulty) {
          console.log(
            `   Difficulty data: ${JSON.stringify(error.data.difficulty)}`
          );
        }
        console.log("");
      });
    }

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
