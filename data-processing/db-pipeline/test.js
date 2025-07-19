const fs = require("fs");

async function testProcessor() {
  const DataProcessor = require("./processor");
  const config = require("./config.json");

  //config.databaseExporter.collections = {
  //summits: [
  //"teufelsturmSummits",
  //{ dependency: "osmLocations", type: "gpsLocation" },
  //],
  //};

  const processor = new DataProcessor(config, "debug");
  await processor.exportData();
}
if (require.main === module) {
  testProcessor();
}
