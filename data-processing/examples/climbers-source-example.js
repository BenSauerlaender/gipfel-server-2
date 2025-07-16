const ClimbersSource = require("../lib/sources/climbers-source");
const SimpleCache = require("../lib/core/simple-cache");

/**
 * Simple example demonstrating ClimbersSource usage
 */
async function runClimbersExample() {
  console.log("=== Climbers Source Example ===\n");

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
    inputFile: "../data-proccessing/input/climbers.json",
  };

  try {
    const source = new ClimbersSource(config, logger, cache);

    // Process climbers data
    const result = await source.process();

    // Display results with new structure
    console.log("\n=== Results ===");
    console.log(`Total climbers: ${result.climbers.length}`);
    console.log(`Processed at: ${result.metadata.processedAt}`);
    console.log(
      `Validation: ${result.metadata.validationResults.totalValidated} valid, ${result.metadata.validationResults.errors} errors`
    );

    console.log("\n=== Sample Climbers ===");
    result.climbers.slice(0, 3).forEach((climber) => {
      console.log(`- ${climber.firstName} ${climber.lastName}`);
    });

    // Test caching
    console.log("\n=== Cache Test ===");
    await source.process(); // Should use cache
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runClimbersExample().catch((error) => {
    console.error("Example failed:", error);
    process.exit(1);
  });
}

module.exports = { runClimbersExample };
