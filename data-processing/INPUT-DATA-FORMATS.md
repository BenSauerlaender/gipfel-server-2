# Data Processing Input Formats

This document describes the expected input data formats for all data sources in the processing pipeline.

## Routes Source (JSON)

**File**: `routes.json`  
**Format**: JSON array of route objects

### Required Fields

- `name` (string): Route name (non-empty)
- `summit` (string): Summit/location name (non-empty)
- `difficulty` (object): At least one difficulty rating

### Optional Fields

- `teufelsturmId` (string): Teufelsturm database ID
- `teufelsturmScore` (string): Score from -3 to 3
- `unsecure` (boolean): Safety flag
- `stars` (number): Quality rating (0, 1, or 2)

### Difficulty Types

- `normal` (string): Standard difficulty
- `RP` (string): Red point difficulty
- `jump` (string): Dynamic move difficulty
- `withoutSupport` (string): Free solo difficulty

### Example

```json
[
  {
    "name": "Perrykante",
    "summit": "Tante",
    "teufelsturmId": "",
    "teufelsturmScore": "",
    "stars": 1,
    "difficulty": {
      "normal": "V"
    }
  }
]
```

## Climbers Source (JSON)

**File**: `climbers.json`  
**Format**: JSON array of climber name strings

### Format

Array of strings where each string is a climber's full name.

### Example

```json
["John Doe", "Jane Smith", "Mike Johnson"]
```

## Teufelsturm Routes Source (HTML)

**Files**: `wege1.html`, `wege2.html`  
**Format**: HTML files with route data in tables

### Expected Structure

HTML tables containing route information with columns for:

- Route names
- Difficulty ratings
- Summit associations
- Teufelsturm-specific metadata

## Teufelsturm Summits Source (HTML)

**Files**: `wege1.html`, `wege2.html`  
**Format**: HTML files with summit data

### Expected Structure

HTML containing summit information including:

- Summit names
- Location data
- Teufelsturm IDs
- Regional classifications

## OSM Locations Source (GeoJSON)

**File**: `points.geojson`  
**Format**: GeoJSON FeatureCollection

### Expected Structure

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [longitude, latitude]
      },
      "properties": {
        "name": "Location Name",
        "natural": "peak",
        "sport": "climbing"
      }
    }
  ]
}
```

### Key Properties

- `name`: Location name for matching
- `natural`: Geographic feature type
- `sport`: Activity type (climbing, etc.)

## Ascents Source (JSON)

**File**: `ascents.json`  
**Format**: JSON object with climber abbreviation map and ascents array

### Structure

```json
{
  "climberAbbrMap": {
    "Kay": "Kay Sauerländer",
    "Ben": "Ben Sauerländer"
  },
  "ascents": [...]
}
```

### Ascent Object Fields

- `date` (string): Date in YYYY-MM-DD format (required)
- `number` (number): Sequential number for same day (required)
- `route` (string): Route name (required)
- `climbers` (array): Array of climber abbreviations (required, at least one)
- `leadClimber` (string): Lead climber abbreviation (optional)
- `isAborted` (boolean): Whether ascent was aborted (optional)
- `isTopRope` (boolean): Top rope ascent flag (optional)
- `isSolo` (boolean): Solo ascent flag (optional)
- `isWithoutSupport` (boolean): Free solo flag (optional)
- `notes` (string): Additional notes (optional)

### Processing Rules

- **Climber Mapping**: Abbreviations are mapped to full names via `climberAbbrMap`
- **Aborted Climbers**: Climbers in parentheses `(Ben)` are marked as `isAborted: true`
- **Date Processing**: `number` field is added to date as milliseconds for same-day ordering
- **Consecutive Milliseconds**: Same-day ascents get consecutive millisecond values starting from 1

### Expected Output Format

```javascript
{
  date: Date,                    // Date with milliseconds from number field
  route: String,                 // Route name (required)
  climbers: [{                   // Array of climber objects (required, at least one)
    climber: String,             // Full climber name
    isAborted: Boolean           // Default: false, true if in parentheses
  }],
  leadClimber: String,           // Full lead climber name (optional)
  isAborted: Boolean,            // Overall ascent aborted flag (optional)
  isTopRope: Boolean,            // Top rope flag (optional)
  isSolo: Boolean,               // Solo flag (optional)
  isWithoutSupport: Boolean,     // Free solo flag (optional)
  notes: String                  // Notes (optional)
}
```

## Data Processing Notes

### Property Filtering

All sources automatically filter out:

- `null` or `undefined` values
- Empty strings (`""`)
- Whitespace-only strings

### Validation

- Required fields are validated for presence and type
- Optional fields are validated when present
- Invalid records are logged but processing continues
- Duplicate detection varies by source type

### Caching

- All sources support file-based caching
- Cache invalidation based on source file modification times
- Dependency-aware caching for sources with dependencies
