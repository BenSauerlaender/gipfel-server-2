const { AscentsSource } = require("../lib/sources");
const SimpleCache = require("../lib/core/simple-cache");

// Simple logger for demonstration
const logger = {
  debug: (msg, details) => console.log(`[DEBUG] ${msg}`, details || ""),
  info: (msg, details) => console.log(`[INFO] ${msg}`, details || ""),
  warn: (msg, details) => console.warn(`[WARN] ${msg}`, details || ""),
  error: (msg, details) => console.error(`[ERROR] ${msg}`, details || ""),
};

async function demonstrateAscentsSource() {
  console.log("=== AscentsSource Example ===\n");

  try {
    // Create cache instance
    const cache = new SimpleCache({
      cacheDir: "./cache",
      logger: logger,
    });

    // Create AscentsSource with configuration
    const ascentsSource = new AscentsSource(
      {
        inputFile: "input-data/ascents.json",
        cache: { enabled: true },
      },
      logger,
      cache
    );

    console.log("Processing ascents data...\n");

    // Process ascents data
    const result = await ascentsSource.process();

    console.log("\n=== Processing Results ===");
    console.log(`Total ascents processed: ${result.ascents.length}`);
    console.log(`Processing completed at: ${result.metadata.processedAt}`);
    console.log(`Validation results:`, result.metadata.validationResults);

    console.log("\n=== Sample Ascents ===");
    // Show first 5 ascents as examples
    result.ascents.slice(0, 5).forEach((ascent, index) => {
      console.log(`\nAscent ${index + 1}:`);
      const date =
        ascent.date instanceof Date ? ascent.date : new Date(ascent.date);
      console.log(`  Date: ${date.toISOString()}`);
      console.log(`  Route: ${ascent.route}`);
      console.log(
        `  Climbers: ${ascent.climbers
          .map((c) => `${c.climber}${c.isAborted ? " (aborted)" : ""}`)
          .join(", ")}`
      );
      if (ascent.leadClimber)
        console.log(`  Lead Climber: ${ascent.leadClimber}`);
      if (ascent.isAborted) console.log(`  Aborted: ${ascent.isAborted}`);
      if (ascent.isTopRope) console.log(`  Top Rope: ${ascent.isTopRope}`);
      if (ascent.isSolo) console.log(`  Solo: ${ascent.isSolo}`);
      if (ascent.isWithoutSupport)
        console.log(`  Without Support: ${ascent.isWithoutSupport}`);
      if (ascent.notes) console.log(`  Notes: ${ascent.notes}`);
    });

    console.log("\n=== Statistics ===");

    // Climber participation
    const climberStats = {};
    result.ascents.forEach((ascent) => {
      ascent.climbers.forEach((climber) => {
        climberStats[climber.climber] =
          (climberStats[climber.climber] || 0) + 1;
      });
    });
    console.log("Climber participation:", climberStats);

    // Ascent types
    const typeStats = {
      total: result.ascents.length,
      aborted: result.ascents.filter((a) => a.isAborted).length,
      topRope: result.ascents.filter((a) => a.isTopRope).length,
      solo: result.ascents.filter((a) => a.isSolo).length,
      withoutSupport: result.ascents.filter((a) => a.isWithoutSupport).length,
    };
    console.log("Ascent types:", typeStats);

    // Date range
    const dates = result.ascents
      .map((a) => (a.date instanceof Date ? a.date : new Date(a.date)))
      .sort((a, b) => a - b);
    console.log(
      `Date range: ${dates[0].toDateString()} to ${dates[dates.length - 1].toDateString()}`
    );

    // Same-day ascents example
    console.log("\n=== Same-Day Consecutive Milliseconds Example ===");
    const sameDayAscents = result.ascents.filter((a) => {
      const date = a.date instanceof Date ? a.date : new Date(a.date);
      return date.toDateString() === new Date("2016-10-02").toDateString();
    });
    if (sameDayAscents.length > 1) {
      console.log("Ascents on 2016-10-02:");
      sameDayAscents.forEach((ascent, index) => {
        const date =
          ascent.date instanceof Date ? ascent.date : new Date(ascent.date);
        console.log(
          `  ${index + 1}. ${ascent.route} - ${date.getTime()} (ms: ${date.getMilliseconds()})`
        );
      });
    }

    // Demonstrate caching
    console.log("\n=== Testing Cache ===");
    console.log("Processing again to test caching...");
    const cachedResult = await ascentsSource.process();
    console.log(
      `Cache hit: ${cachedResult.ascents.length === result.ascents.length ? "Yes" : "No"}`
    );
  } catch (error) {
    console.error("Error processing ascents:", error.message);
    if (error.details) {
      console.error("Error details:", error.details);
    }
    console.error("Stack trace:", error.stack);
  }
}

// Run the example
if (require.main === module) {
  demonstrateAscentsSource().catch(console.error);
}

module.exports = { demonstrateAscentsSource };
