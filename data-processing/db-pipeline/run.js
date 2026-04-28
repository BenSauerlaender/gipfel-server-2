const fs = require("fs");

async function runProcessor() {
  const DataProcessor = require("./processor");
  const config = require("./config.json");

  const processor = new DataProcessor(config);
  await processor.exportData();
}
if (require.main === module) {
  runProcessor();
}
