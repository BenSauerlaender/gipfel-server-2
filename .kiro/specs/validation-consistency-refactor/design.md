# Design Document

## Overview

This design addresses the validation inconsistencies in the data processing pipeline by establishing clear separation of concerns between parsing and validation, creating reusable validation utilities, and standardizing validation patterns across all sources.

## Architecture

### Current Issues Identified

1. **Data Transformation in Validation**: Sources like `ClimbersSource`, `RoutesSource`, and `OSMLocationsSource` perform data transformation (`.trim()`, `.toLowerCase()`) in validation methods
2. **Duplicate Validation Patterns**: All sources implement similar validation loops, error collection, and warning detection
3. **Inconsistent Error Handling**: While all sources follow similar patterns, there are subtle differences in implementation
4. **Mixed Responsibilities**: Parse methods sometimes do transformation, validation methods sometimes do transformation

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BaseSource                               │
├─────────────────────────────────────────────────────────────┤
│  process() → fetch() → parse() → validate()                │
│                         ↓           ↓                      │
│                   Transform    Validate Only               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ValidationService                           │
├─────────────────────────────────────────────────────────────┤
│  • validateArrayData()                                     │
│  • checkForDuplicates()                                    │
│  • validateRequiredString()                                │
|    validateOptionalString()                                 |
|    validateOptionalObject()                                 |
│  • validateRequiredObject()                                │
│  • getValidationResults()                               │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Validation Module

A new Service module that provides common validation functions:

```javascript
class ValidationService {
  constructor(parsedData){
    this.parsedData = parsedData
  }
  const errors = [] //List of collected Errors
  const warnings = [] //List of collected Warnings

  // Validate array of items with consistent error collection
  // add warnings and errors to list
  async validateArrayData(items, validateSingleItem, sourceName)

  // Note: For nested arrays, simply call validateArrayData() within validateSingleItem()

  // Check for duplicates using a key function
  // add warnings to list
  checkForDuplicates(items, getKeyFunction, sourceName)

  // returns validation results consistently
  getValidationResults()

  // Common field validators - adds errors/warnigs to list
  // validateRequiredString: checks if value is non-empty string, adds error if not
  // validateRequiredObject: checks if value is non-null object, adds error if not
  // validateOptionalString: checks if value is non-empty string, adds warning if not
  // validateOptionalString: checks if value is non-null object, adds warning if not
  validateRequiredString(value, fieldName, sourceName)
  validateRequiredObject(value, fieldName, sourceName)
  validateOptionalString(value, fieldName, sourceName)
  validateOptionalObject(value, fieldName, sourceName)
}
```

### 2. Refactored Source Structure

Each source will follow this pattern:

```javascript
class ExampleSource extends BaseSource {
  // Parse: Transform data only
  async parse(rawData, dependencies = {}) {
    // 1. Parse structure
    // 2. Transform data (trim, case conversion, splitting)
    // 3. Return clean, transformed data
  }

  // Validate: Validate structure and business rules only (no transform)
  async validate(parsedData) {
    const validator = new ValidationService(parsedData);
    // 1. Validate overall structure
    // 2. Use validator.validateArrayData()
    // 3. Use validator.checkForDuplicates()
    // use validator.errors.push()/validator.warnings.push() for custom validation
    return validator.getValidationResults;
  }

  // Single item validation (no transformation)
  async validateSingleItem(item, index) {
    // Only validation logic, no transformation
  }
}
```

### 3. Data Transformation Guidelines

**In Parse Methods:**

- String trimming: `name.trim()`
- Case conversion: `name.toLowerCase()`
- Data splitting: `fullName.split(' ')`
- Type conversion: `String(value)`
- Data cleaning: removing empty values

**In Validate Methods:**

- Structure validation: checking types and required fields
- Business rule validation: checking constraints
- Data integrity validation: checking relationships
- No data transformation

## Data Models

### ValidationResult Structure

```javascript
{
  [dataType]: validatedItems,     // e.g., climbers, routes, ascents
  metadata: {
    ...originalMetadata,
    validatedAt: Date,
    validationResults: {
      totalValidated: number,
      errorCount: number,
      warningCount: number,
      errors: [{
        type: string,
        message: string,
        count: number
      }],
      warnings: [{
        type: string,
        message: string,
        count: number
      }]
    }
  }
}
```

### Error/Warning Structure

```javascript
{
  errors: [{
    type: string,
    message: string,
    item?: object
  }],
  warnings: [{
    type: string,
    message: string,
    item?: object
  }]
}
```

## Implementation Plan

### Phase 1: Create ValidationService

1. Create `data-processing/lib/core/validation-service.js`
2. Implement common validation functions
3. Add comprehensive tests

### Phase 2: Refactor Parse Methods

For each source:

1. Move all data transformation from validate to parse
2. Ensure parse returns clean, transformed data
3. Update tests to verify transformation happens in parse

### Phase 3: Refactor Validate Methods

For each source:

1. Remove data transformation from validate methods
2. Use ValidationService for common patterns
3. Maintain same validation logic and error messages
4. Update tests to verify no transformation in validate

### Phase 4: Integration Testing

1. Run full test suite to ensure backward compatibility
2. Verify same validation errors and warnings are produced
3. Performance testing to ensure no degradation

## Error Handling

### Validation Error Categories

All transformation errors will use consistent `ProcessingError` categories:

- `PARSE_ERROR`: Data transformation failures (in parse methods)

## Testing Strategy

### Unit Tests

1. **ValidationService Tests**: Test all validation functions independently
2. **Parse Method Tests**: Verify data transformation occurs correctly
3. **Validate Method Tests**: Verify validation logic without transformation
4. **Integration Tests**: Verify parse → validate flow works correctly

### Regression Tests

1. **Output Compatibility**: Ensure refactored sources produce identical output
2. **Error Message Consistency**: Verify same errors are thrown for same inputs
3. **Performance Tests**: Ensure no performance degradation

### Test Data Strategy

1. Use existing test fixtures
2. Add specific test cases for transformation edge cases
3. Add test cases for validation-only scenarios

## Migration Strategy

### Backward Compatibility

1. **External Interface**: No changes to public methods or return values
2. **Error Messages**: Maintain same error messages and types
3. **Validation Logic**: Same business rules and constraints

### Rollout Plan

1. **Source-by-Source**: Refactor one source at a time
2. **Test Coverage**: Ensure 100% test coverage before refactoring
3. **Validation**: Run full test suite after each source refactor
4. **Documentation**: Update inline documentation for each refactored source

## Performance Considerations

### Optimization Strategies

1. **Shared Utilities**: Reuse validation functions to reduce code duplication
2. **Early Validation**: Fail fast on structure validation before item-by-item validation

## Dependencies

### New Dependencies

- None (using existing dependencies)

### Modified Files

- `data-processing/lib/util/validation-utilities.js` (new)
- All source files in `data-processing/lib/sources/`
- Corresponding test files
- `data-processing/lib/util/index.js` (export new utilities)

### Configuration Changes

- None required (internal refactoring only)
