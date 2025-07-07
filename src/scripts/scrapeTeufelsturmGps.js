const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();
const Summit = require('../models/Summit');
const generateMongoUri = require('../utill/mongoUri');

const mongoUri = generateMongoUri();
const outputPath = 'data/teufelsturm/teufelsturm-gps.json';

const RED = (text) => `\x1b[31m${text}\x1b[0m`;
const YELLOW = (text) => `\x1b[33m${text}\x1b[0m`;

async function getGpsFromGipfelnr(gipfelnr) {
  try {
    const url = `https://teufelsturm.de/gipfel/details.php?gipfelnr=${gipfelnr}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const pageText = $.text();
    const lonMatch = pageText.match(/Longitude\s*([\d\.]+)/);
    const latMatch = pageText.match(/Latitude\s*([\d\.]+)/);
    if (lonMatch && latMatch) {
      return {
        // teufelsturm mix up lat and lng
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

async function scrapeTeufelsturmGps() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    const summits = await Summit.find();
    const results = [];
    let scrapedCount = 0;
    let skippedCount = 0;
    for (const summit of summits) {
      if (summit.teufelsturmId) {
        const gps = await getGpsFromGipfelnr(summit.teufelsturmId);
        if (gps) {
          results.push({
            name: summit.name,
            teufelsturmId: summit.teufelsturmId,
            lng: gps.lng,
            lat: gps.lat
          });
          scrapedCount++;
          console.log(`Scraped ${summit.name}: lng=${gps.lng}, lat=${gps.lat}`);
        } else {
          results.push({
            name: summit.name,
            teufelsturmId: summit.teufelsturmId,
            lng: null,
            lat: null
          });
          skippedCount++;
          console.warn(YELLOW(`No GPS found for ${summit.name}`));
        }
      } else {
        skippedCount++;
        console.warn(YELLOW(`No teufelsturmId for ${summit.name}`));
      }
    }
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Done. Scraped ${scrapedCount} summits, skipped ${skippedCount}. Output: ${outputPath}`);

    process.exit(0);
  } catch (err) {
    console.error(RED('Error scraping teufelsturm GPS:'), err);
    process.exit(1);
  }
}

scrapeTeufelsturmGps();