const DataProcessor = require("../lib/core/processor");
const {
  ClimbersSource,
  TeufelsturmSummitsSource,
  OSMLocationsSource,
} = require("../lib/sources");
const fs = require("fs");
const path = require("path");

/**
 * Example demonstrating the DataProcessor with direct configuration
 */
async function demonstrateProcessor() {
  console.log("=== DataProcessor Example ===\n");

  try {
    // Create sample data file for demonstration
    const sampleClimbers = ["John Doe", "Jane Smith", "Bob Johnson"];

    const fixturesDir = path.join(__dirname, "../tests/fixtures");
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const sampleFile = path.join(fixturesDir, "sample-climbers.json");
    fs.writeFileSync(sampleFile, JSON.stringify(sampleClimbers, null, 2));

    // Create processor with direct config - no separate initialization needed!
    const processor = new DataProcessor({
      config: {
        sources: {
          climbers: {
            enabled: true,
            config: {
              inputFile: "data-processing/input-data/climbers.json",
            },
          },
        },
        cache: {
          enabled: true,
          path: "./cache",
        },
      },
      logging: { level: "info" },
    });

    // Register source handlers
    processor.registerSource("climbers", ClimbersSource);
    processor.registerSource("teufelsturmSummits", TeufelsturmSummitsSource);
    processor.registerSource("osmLocations", OSMLocationsSource);

    console.log("Processing climbers source with DataProcessor...\n");

    // Process individual source to demonstrate functionality
    const climbersResult = await processor.processSource("climbers");

    if (
      climbersResult.status === "completed" &&
      climbersResult.data?.climbers
    ) {
      console.log("✓ DataProcessor successfully processed climbers!");
      console.log(`Records processed: ${climbersResult.data.climbers.length}`);
      console.log("Sample climbers:");
      climbersResult.data.climbers.forEach((climber) => {
        console.log(`  - ${climber.firstName} ${climber.lastName}`);
      });

      if (climbersResult.data.metadata?.validationResults) {
        const validation = climbersResult.data.metadata.validationResults;
        console.log(
          `Validation: ${validation.totalValidated} validated, ${validation.warnings?.length || 0} warnings`
        );
      }
    } else {
      console.log(
        "✗ Processing failed:",
        climbersResult.error || "Unknown error"
      );
    }

    // Show processing stats
    console.log("\n=== Processing Statistics ===");
    const stats = processor.getProcessingStats();
    console.log(`Successful sources: ${stats.successfulSources}`);
    console.log(`Failed sources: ${stats.failedSources}`);
    console.log(`Total records: ${stats.totalRecords}`);
    console.log(`Errors encountered: ${stats.errors.length}`);

    // Clean up sample file
    if (fs.existsSync(sampleFile)) {
      fs.unlinkSync(sampleFile);
    }
  } catch (error) {
    console.error("Processing failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

/**
 * Example demonstrating dependency resolution with direct configuration
 */
async function demonstrateDependencyResolution() {
  console.log("\n=== Dependency Resolution Example ===\n");

  try {
    // Create sample HTML file for TeufelsturmSummits
    const sampleHtml = `
      <table>
        <tr>
          <td><a href="/summit/1">Test Summit</a></td>
          <td>Test Region</td>
          <td>1000m</td>
        </tr>
      </table>
    `;

    const fixturesDir = path.join(__dirname, "../tests/fixtures");
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const sampleHtmlFile = path.join(fixturesDir, "sample-summits.html");
    fs.writeFileSync(sampleHtmlFile, sampleHtml);

    // Create processor with dependency configuration directly
    const processor = new DataProcessor({
      config: {
        sources: {
          teufelsturmSummits: {
            enabled: true,
            config: {
              inputFile: "data-processing/input-data/tt.summits.html",
            },
          },
          osmLocations: {
            enabled: true,
            config: {
              inputFile: "data-processing/input-data/points.geojson",
              dependencies: ["teufelsturmSummits"],
            },
          },
        },
        cache: {
          enabled: true,
          path: "./cache",
        },
      },
      logging: { level: "info" },
    });

    // Register source handlers
    processor.registerSource("teufelsturmSummits", TeufelsturmSummitsSource);
    processor.registerSource("osmLocations", OSMLocationsSource);

    console.log(
      "Processing osmLocations (which depends on teufelsturmSummits)..."
    );
    console.log(
      "The processor will automatically process teufelsturmSummits first.\n"
    );

    const result = await processor.processSource("osmLocations");

    if (result.status === "completed") {
      console.log("✓ Dependency resolution worked!");
      console.log(
        `OSM locations processed: ${result.data?.locations?.length || 0}`
      );
      console.log(
        `Matched summits: ${result.data?.metadata?.matchedSummits || 0}`
      );
    } else {
      console.log("✗ Processing failed:", result.error || "Unknown error");
    }

    // Clean up sample files
    [sampleHtmlFile].forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  } catch (error) {
    console.error("Dependency resolution failed:", error.message);
  }
}

// Run the examples if this file is executed directly
if (require.main === module) {
  (async () => {
    await demonstrateProcessor();
    await demonstrateDependencyResolution();
  })().catch(console.error);
}

module.exports = { demonstrateProcessor, demonstrateDependencyResolution };
