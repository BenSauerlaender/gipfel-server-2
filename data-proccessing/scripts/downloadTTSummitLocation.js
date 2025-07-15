const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const config = require('../config/config.json');

const urlTemplate = config.downloadTTSummitLocations.url;
const inputFile = path.join(__dirname, '../', config.downloadTTSummitLocations.inputFile);
const outputFile = path.join(__dirname, '../', config.downloadTTSummitLocations.outputFile);

function RED(text) { return `\x1b[31m${text}\x1b[0m`; }
function YELLOW(text) { return `\x1b[33m${text}\x1b[0m`; }

async function getGpsFromGipfelnr(gipfelnr) {
  try {
    const url = urlTemplate.replace('<gipfelNr>', gipfelnr);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const pageText = $.text();
    const lonMatch = pageText.match(/Longitude\s*([\d\.]+)/);
    const latMatch = pageText.match(/Latitude\s*([\d\.]+)/);
    if (lonMatch && latMatch) {
      // teufelsturm mix up lat and lng
      return {
        lng: parseFloat(latMatch[1]),
        lat: parseFloat(lonMatch[1])
      };
    }
    return null;
  } catch (err) {
    console.error(RED(`Error scraping GPS for gipfelnr ${gipfelnr}:`), err.message);
    return null;
  }
}

async function main() {
  const onlyFirst = process.argv.includes('--first');
  const summits = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const results = {};
  let scrapedCount = 0;
  let skippedCount = 0;
  const toProcess = onlyFirst ? [summits[0]] : summits;
  for (const summit of toProcess) {
    if (summit.teufelsturmId) {
      const gps = await getGpsFromGipfelnr(summit.teufelsturmId);
      if (gps && gps.lng && gps.lat) {
        results[summit.name] = { lng: gps.lng, lat: gps.lat };
        scrapedCount++;
        console.log(`Scraped ${summit.name}: lng=${gps.lng}, lat=${gps.lat}`);
      } else {
        results[summit.name] = { lng: null, lat: null };
        skippedCount++;
        console.warn(YELLOW(`No GPS found for ${summit.name}`));
      }
    } else {
      skippedCount++;
      console.warn(YELLOW(`No teufelsturmId for ${summit.name}`));
    }
  }
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`Done. Scraped ${scrapedCount} summits, skipped ${skippedCount}. Output: ${outputFile}`);
}

main();
