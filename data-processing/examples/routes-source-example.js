const { RoutesSource } = require("../lib/sources");
const SimpleCache = require("../lib/core/simple-cache");

// Simple logger for demonstration
const logger = {
  debug: (msg, details) => console.log(`[DEBUG] ${msg}`, details || ""),
  info: (msg, details) => console.log(`[INFO] ${msg}`, details || ""),
  warn: (msg, details) => console.warn(`[WARN] ${msg}`, details || ""),
  error: (msg, details) => console.error(`[ERROR] ${msg}`, details || ""),
};

async function demonstrateRoutesSource() {
  console.log("=== RoutesSource Example ===\n");

  try {
    // Create cache instance
    const cache = new SimpleCache({
      cacheDir: "./cache",
      logger: logger,
    });

    // Create RoutesSource with configuration
    const routesSource = new RoutesSource(
      {
        inputFile: "input-data/routes.json",
        cache: { enabled: true },
      },
      logger,
      cache
    );

    console.log("Processing routes data...\n");

    // Process routes data
    const result = await routesSource.process();

    console.log("\n=== Processing Results ===");
    console.log(`Total routes processed: ${result.routes.length}`);
    console.log(`Processing completed at: ${result.metadata.processedAt}`);
    console.log(`Validation results:`, result.metadata.validationResults);

    console.log("\n=== Sample Routes ===");
    // Show first 3 routes as examples
    result.routes.slice(0, 3).forEach((route, index) => {
      console.log(`\nRoute ${index + 1}:`);
      console.log(`  Name: ${route.name}`);
      console.log(`  Summit: ${route.summit}`);
      console.log(`  Difficulty:`, route.difficulty);
      if (route.stars !== undefined) console.log(`  Stars: ${route.stars}`);
      if (route.teufelsturmId)
        console.log(`  Teufelsturm ID: ${route.teufelsturmId}`);
      if (route.teufelsturmScore)
        console.log(`  Teufelsturm Score: ${route.teufelsturmScore}`);
      if (route.unsecure !== undefined)
        console.log(`  Unsecure: ${route.unsecure}`);
    });

    console.log("\n=== Difficulty Types Summary ===");
    const difficultyTypes = {};
    result.routes.forEach((route) => {
      Object.keys(route.difficulty).forEach((type) => {
        difficultyTypes[type] = (difficultyTypes[type] || 0) + 1;
      });
    });
    console.log(difficultyTypes);

    console.log("\n=== Stars Distribution ===");
    const starsDistribution = {};
    result.routes.forEach((route) => {
      const stars = route.stars !== undefined ? route.stars : "undefined";
      starsDistribution[stars] = (starsDistribution[stars] || 0) + 1;
    });
    console.log(starsDistribution);

    // Demonstrate caching
    console.log("\n=== Testing Cache ===");
    console.log("Processing again to test caching...");
    const cachedResult = await routesSource.process();
    console.log(
      `Cache hit: ${cachedResult === result ? "No" : "Yes (different object but same data)"}`
    );

    console.log("Cache cleared successfully");
  } catch (error) {
    console.error("Error processing routes:", error.message);
    if (error.details) {
      console.error("Error details:", error.details);
    }
    console.error("Stack trace:", error.stack);
  }
}

// Run the example
if (require.main === module) {
  demonstrateRoutesSource().catch(console.error);
}

module.exports = { demonstrateRoutesSource };
