const fs = require('fs');
const path = require('path');
const config = require('../config/config.json');

const inputFile = path.join(__dirname, '../', config.convertOSMLocations.inputFile);
const summitFiles = config.convertOSMLocations.summitFiles.map(f => path.join(__dirname, '../', f));
const outputFile = path.join(__dirname, '../', config.convertOSMLocations.outputFile);

function loadSummitNames(files) {
  const names = new Set();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const summits = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const s of summits) {
      if (s.name) names.add(s.name.trim());
    }
  }
  return names;
}

function hasClimbingTag(tags) {
  return typeof tags === 'string' && tags.includes('climbing');
}

async function main() {
  const summitNames = loadSummitNames(summitFiles);
  const geojson = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const results = {};
  let foundCount = 0;
  let checkedCount = 0;
  for (const feature of geojson.features) {
    checkedCount++;
    const props = feature.properties;
    const name = props && props.name ? props.name.trim() : null;
    if (!name || !summitNames.has(name)) continue;
    if (!hasClimbingTag(props.other_tags)) continue;
    if (results[name]) continue; // skip duplicates
    const coords = feature.geometry && feature.geometry.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      results[name] = { lng: coords[0], lat: coords[1] };
      foundCount++;
    }
  }
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`Done. Found ${foundCount} summits out of ${summitNames.size} checked. Output: ${outputFile}`);
}

main();
