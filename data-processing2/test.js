const fs = require("fs");

function testProcessor() {
  const DataProcessor = require("./processor");
  const config = require("./config.json");

  // clear cache
  if (fs.existsSync(config.cacheDir)) {
    fs.rmSync(config.cacheDir, { recursive: true });
  }

  const processor = new DataProcessor(config);
  processor.importData("ascentsJson");
  console.log("Data imported successfully.");
}
if (require.main === module) {
  testProcessor();
}
