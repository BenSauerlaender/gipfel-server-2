const AscentJsonImporter = require("./data-processing2/importers/ascentsJsonImporter");

// Mock logger
const logger = {
  info: console.log,
  debug: console.log,
  error: console.error,
};

// Create test data
const testClimbers = {
  data: {
    climbers: [
      { abbr: "AB", name: "Alice Brown" },
      { abbr: "CD", name: "Charlie Davis" },
    ],
  },
};

const testAscentWithLeadClimber = {
  climbers: ["AB", "CD"],
  route: "Test Route 1",
  date: "2023-01-01",
  leadClimber: "AB",
};

const testAscentWithoutLeadClimber = {
  climbers: ["AB", "CD"],
  route: "Test Route 2",
  date: "2023-01-02",
};

// Test the importer
const importer = new AscentJsonImporter("test", logger);

console.log("Testing ascent WITH lead climber:");
const result1 = importer.validateSingleAscent(
  testAscentWithLeadClimber,
  0,
  "test.json",
  new Map([
    ["AB", { abbr: "AB", name: "Alice Brown" }],
    ["CD", { abbr: "CD", name: "Charlie Davis" }],
  ])
);
console.log("Result:", JSON.stringify(result1, null, 2));

console.log("\nTesting ascent WITHOUT lead climber:");
const result2 = importer.validateSingleAscent(
  testAscentWithoutLeadClimber,
  1,
  "test.json",
  new Map([
    ["AB", { abbr: "AB", name: "Alice Brown" }],
    ["CD", { abbr: "CD", name: "Charlie Davis" }],
  ])
);
console.log("Result:", JSON.stringify(result2, null, 2));

console.log("\nTest completed!");
