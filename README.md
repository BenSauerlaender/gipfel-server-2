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

## TODO:
- fix summit gps
- check for summits gps out of bound

- create cohesive data gen pipeline

- Do the map style downloads "automaticly"

- save Server log

## Ascent notes
- Zwergfels => Zwerg 
- Kuchenturm, Septemberweg existiert nicht
- 10.05.24 Bierdeckel AW (E. var.) => Variante zur Westkante 
- 19.05.23 Stillerturm, AW existiert nicht
- inconsistency: Schildkroete, W-Kante (statt Westkante) in der DB
- inconsistency: "Lokomotive-Dom" vs. "Lokomotive - Esse"




### sync data to prod
rsync -avz --delete -e "ssh" data/map/ stratoAppuser:/var/www/gipfelapp/api/data/map/