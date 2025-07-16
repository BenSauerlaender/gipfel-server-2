# gipfel-server-2

start database:
docker-compose -f docker-compose-mongodb.yml up -d

start server:
npm run dev

# Create Map Resources

This section explains how to generate and organize the map resources for gipfel-server-2.

## Vector Map Tiles

- **Location:** `data/tiles.tar.gz`
- **Contents:** Archive of uncompressed `.pbf` vector tiles in the structure: `tiles/{z}/{x}/{y}.pbf`
- **Tools Required:**
  - [osmium](https://osmcode.org/osmium-tool/) - For filtering OpenStreetMap data
  - [openmaptiles](https://github.com/openmaptiles/openmaptiles) (needs to be cloned locally and prepared via `make`) - For generating vector tiles
  - [mb-util](https://github.com/mapbox/mbutil) - For extracting tiles
  - Standard Unix tools: `wget`, `gunzip`, `tar`

- **Generation:**  
  Specify settings in the `.env` file (see `map.example.env`)

  Run:

  ```bash
  ./create-tiles
  ```

  This script:
  1. Downloads OpenStreetMap data
  2. Filters to your region
  3. Generates vector tiles
  4. Packages them into `data/tiles.tar.gz`

## Map Fonts

- **Location:** `fonts.tar.gz`
- **Contents:** Archive of font files structured as: `fonts/{name}/{range}.pbf`
- **Generation:**
  1. Clone [openmaptiles/fonts](https://github.com/openmaptiles/fonts)
  2. Follow the repository instructions
  3. Copy generated fonts to this project

## Map Style

- **Files:**
  - `data/style.json` - Map style using OpenMapTiles Schema
  - `data/sprite.json` - Sprite configuration
  - `data/sprite.png` - Sprite image

- **Generation:**
  1. Log in to [MapTiler Cloud](https://cloud.maptiler.com/maps/)
  2. Open GipfelAppMap
  3. Customize style as needed
  4. Save and publish changes
  5. Download style:
     - Get `style.json` from "Use vector style"
     - Remove access tokens from:
       - `sources.openmaptiles.url`
       - `glyphs`
  6. Download sprites:
     - Get base URL from `sprite` field in `style.json`
     - Download `{base_url}.png` → `sprite.png`
     - Download `{base_url}.json` → `sprite.json`

---

These resources must be present for the map server to function correctly. After generating, verify all files are in their correct locations before

# TODO

- fix Ivi name
- fix dataImport
- fix mongo connector
- add dbSync
- add db backup

## Data Generation pipeline _!_

### DB _!_

- inputs: teufelsturmScrape(url?), osmDaten, ascents.json, aditional-routes.json
- output: teufelsturmJson, gpsOSMJson ggsTeufelsturmJson, teufelstum
- +DB Update scripts (import Routes, import Ascents, patch Gps, patch Teufelsturm GipfelNr)

### Fonts

- angleichen

### Style, Sprite,

- input: config(styleURL, ACCESSTOKEN)
- output, style.json, sprite.png, sprite.json

## Deployment scripts _!_

- code, files, dbSync, db backup

## Documentation

## Featues:

- bundle all mapResources as .tar.gz

## Route parsing errors:

1. Zugang at Ziegenrückenturm (Rathener Gebiet)
   Error: Route must have at least one difficulty set
   TeufelsturmId: 6366
   Difficulty data: {}

2. Stripteasehöhle at Großer Eislochturm (Bielatal)
   Error: Route must have at least one difficulty set
   TeufelsturmId: 4149
   Difficulty data: {}

3. Zustieg at Griesgrundwächter (Wehlener Gebiet)
   Error: Route must have at least one difficulty set
   TeufelsturmId: 7298
   Difficulty data: {}

4. Mittelweg at Wartturm (Rathener Gebiet)
   Error: Route must have at least one difficulty set
   TeufelsturmId: 991
   Difficulty data: {}

5. Schwedenhöhle at Rabenturm (Bielatal)
   Error: Route must have at least one difficulty set
   TeufelsturmId: 4150
   Difficulty data: {}

## Ascent notes

- Zwergfels => Zwerg (maybe fix)
- Kuchenturm, Septemberweg existiert nicht
- inconsistency: Schildkroete, W-Kante (statt Westkante) in der DB
- inconsistency: "Lokomotive-Dom" vs. "Lokomotive - Esse"

## get points.geojson

ogr2ogr -f "GeoJSON" points.geojson filtered.osm.pbf -sql "SELECT \* FROM points"

- TODO: use original osm.pbf set bounding box with -clipsrc bounds.json (https://gdal.org/en/stable/programs/ogr2ogr.html#ogr2ogr)

### sync data to prod

rsync -avz --delete -e "ssh" data/map/ stratoAppuser:/var/www/gipfelapp/api/data/map/

### sync db to prod

mongodump --host localhost --port 27017 --db test --out ./dump
mongo <host>:<port>/test --eval "db.dropDatabase()"
mongorestore --host <host> --port <port> --db test ./dump/test
