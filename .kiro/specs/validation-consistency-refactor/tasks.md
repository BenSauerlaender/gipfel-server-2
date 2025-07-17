# Implementation Plan

- [ ] 1. Create ValidationService module
  - Create `data-processing/lib/core/validation-service.js` with ValidationService class
  - Implement constructor that takes parsedData and initializes errors/warnings arrays
  - Implement `validateArrayData()` for consistent array validation with error collection (supports nesting by calling within validateSingleItem)
  - Implement `checkForDuplicates()` for consistent duplicate detection using key function, adds warnings to instance
  - Implement `getValidationResults()` for consistent result formatting with error/warning counts
  - Implement field validators: `validateRequiredString()`, `validateRequiredObject()`, `validateOptionalString()`, `validateOptionalObject()` that add errors/warnings to instance
  - Export ValidationService in `data-processing/lib/core/index.js`
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_

- [ ] 2. Create comprehensive tests for ValidationService
  - Write unit tests for all ValidationService methods
  - Test error collection and formatting patterns with instance state
  - Test nested array validation scenarios
  - Test duplicate detection with various key functions
  - Test field validation functions with edge cases
  - Test getValidationResults() output format
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 3. Refactor ClimbersSource parse method
  - Move name trimming and splitting from validate to parse method
  - Ensure parse returns clean firstName/lastName objects
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 4. Refactor ClimbersSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for consistent validation
  - Use validator.checkForDuplicates() for name duplicate detection
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 5. Refactor RoutesSource parse method
  - Move string trimming and difficulty processing from validate to parse method
  - Ensure parse returns clean route objects with trimmed fields
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 6. Refactor RoutesSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for consistent validation
  - Use validator.checkForDuplicates() for route duplicate detection
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 7. Refactor AscentsSource parse method
  - Move string trimming and data cleaning from validate to parse method
  - Ensure parse returns clean ascent objects with trimmed fields
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 8. Refactor AscentsSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for ascents validation
  - Use validator.validateArrayData() within validateSingleAscent() for nested climbers array validation
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 9. Refactor OSMLocationsSource parse method
  - Move name trimming and case conversion from validate to parse method
  - Ensure parse returns clean location objects with trimmed names
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 10. Refactor OSMLocationsSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for consistent validation
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 11. Refactor TeufelsturmSummitsSource parse method
  - Move name trimming and fixSummitName transformation from validate to parse method
  - Ensure parse returns clean summit objects with trimmed fields
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 12. Refactor TeufelsturmSummitsSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for consistent validation
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 13. Refactor TeufelsturmRoutesSource parse method
  - Move string trimming from validate to parse method
  - Ensure parse returns clean route objects with trimmed fields
  - Update tests to verify transformation happens in parse
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 14. Refactor TeufelsturmRoutesSource validate method
  - Remove data transformation from validate method
  - Create ValidationService instance with parsedData
  - Use validator.validateArrayData() for consistent validation
  - Return validator.getValidationResults() with error/warning counts
  - Maintain same validation logic and error messages
  - Update tests to verify no transformation in validate
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 15. Run comprehensive integration tests
  - Execute full test suite to ensure backward compatibility
  - Verify same validation errors and warnings are produced
  - Verify same output data structure is maintained
  - Run performance tests to ensure no degradation
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 16. Update documentation and finalize
  - Update inline documentation for all refactored sources
  - Update architecture documentation to reflect new validation patterns
  - Create usage examples for ValidationService
  - Document the separation of parse vs validate responsibilities
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
