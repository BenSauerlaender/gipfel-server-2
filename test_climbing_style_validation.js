const AscentJsonImporter = require("./data-processing/db-pipeline/importers/ascentsJsonImporter");

// Mock logger
const logger = {
  info: console.log,
  debug: console.log,
  error: console.error,
};

// Create test data
const climbersMap = new Map([
  ["AB", { abbr: "AB", name: "Alice Brown" }],
  ["CD", { abbr: "CD", name: "Charlie Davis" }],
]);

// Test cases for climbing style validation
const testCases = [
  {
    name: "Valid: Only leadClimber",
    data: {
      climbers: ["AB", "CD"],
      route: "Test Route 1",
      date: "2023-01-01",
      leadClimber: "AB",
    },
  },
  {
    name: "Valid: Only isSolo",
    data: {
      climbers: ["AB"],
      route: "Test Route 2",
      date: "2023-01-02",
      isSolo: true,
    },
  },
  {
    name: "Valid: Only isTopRope",
    data: {
      climbers: ["AB", "CD"],
      route: "Test Route 3",
      date: "2023-01-03",
      isTopRope: true,
    },
  },
  {
    name: "Valid: None set (traditional climb)",
    data: {
      climbers: ["AB", "CD"],
      route: "Test Route 4",
      date: "2023-01-04",
    },
  },
  {
    name: "Invalid: leadClimber AND isSolo",
    data: {
      climbers: ["AB"],
      route: "Test Route 5",
      date: "2023-01-05",
      leadClimber: "AB",
      isSolo: true,
    },
  },
  {
    name: "Invalid: leadClimber AND isTopRope",
    data: {
      climbers: ["AB", "CD"],
      route: "Test Route 6",
      date: "2023-01-06",
      leadClimber: "AB",
      isTopRope: true,
    },
  },
  {
    name: "Invalid: isSolo AND isTopRope",
    data: {
      climbers: ["AB"],
      route: "Test Route 7",
      date: "2023-01-07",
      isSolo: true,
      isTopRope: true,
    },
  },
  {
    name: "Invalid: All three set",
    data: {
      climbers: ["AB"],
      route: "Test Route 8",
      date: "2023-01-08",
      leadClimber: "AB",
      isSolo: true,
      isTopRope: true,
    },
  },
];

// Test the importer
const importer = new AscentJsonImporter("test", logger);

console.log("Testing climbing style exclusivity validation:\n");

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  const result = importer.validateSingleAscent(
    testCase.data,
    index,
    "test.json",
    climbersMap
  );

  if (result.error) {
    console.log("   ERROR:", result.error.type, "-", result.error.message);
  } else if (result.warnings) {
    console.log("   WARNINGS:");
    result.warnings.forEach((warning) => {
      console.log("   -", warning.type, ":", warning.message);
    });
  } else {
    console.log("   ✓ No warnings or errors");
  }
  console.log("");
});

console.log("Test completed!");
