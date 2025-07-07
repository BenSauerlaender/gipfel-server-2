const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const Summit = require('../models/Summit');
const Route = require('../models/Route');
const generateMongoUri = require('../utill/mongoUri');
const argv = process.argv.slice(2);
const singleSummitArg = argv[0]; // Can be name or _id

const RED = (text) => `\x1b[31m${text}\x1b[0m`;
const YELLOW = (text) => `\x1b[33m${text}\x1b[0m`;

const mongoUri = generateMongoUri();

async function getGipfelnrFromRouteWegnr(wegnr) {
  try {
    const url = `https://teufelsturm.de/wege/bewertungen/anzeige.php?wegnr=${wegnr}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    // Find the Gipfel link (e.g. /gipfel/details.php?gipfelnr=499)
    const gipfelLink = $("a[href*='/wege/suche.php?gipfelnr=']").attr('href');
    if (!gipfelLink) return null;
    const match = gipfelLink.match(/gipfelnr=(\d+)/);
    return match ? match[1] : null;
  } catch (err) {
    console.error(RED(`Error scraping gipfelnr for wegnr ${wegnr}:`), err.message);
    return null;
  }
}

async function getGpsFromGipfelnr(gipfelnr) {
  try {
    const url = `https://teufelsturm.de/gipfel/details.php?gipfelnr=${gipfelnr}`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    // Find Longitude and Latitude in the page text
    const pageText = $.text();
    const lonMatch = pageText.match(/Longitude\s*([\d\.]+)/);
    const latMatch = pageText.match(/Latitude\s*([\d\.]+)/);
    if (lonMatch && latMatch) {
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

async function findSummit(query) {
  // Try by _id first, then by name
  let summit = await Summit.findById(query).catch(() => null);
  if (!summit) {
    summit = await Summit.findOne({ name: query });
  }
  return summit;
}

async function updateGpsPositions() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    let summits;
    if (singleSummitArg) {
      const summit = await findSummit(singleSummitArg);
      if (!summit) {
        console.error(RED(`Summit not found for argument: ${singleSummitArg}`));
        process.exit(1);
      }
      summits = [summit];
      console.log(YELLOW(`Debug mode: Only processing Summit: ${summit.name} (${summit._id})`));
    } else {
      summits = await Summit.find();
    }
    for (const summit of summits) {
      let updated = false;
      // Step 1: Ensure teufelsturmId (gipfelnr) is present
      if (!summit.teufelsturmId) {
        const route = await Route.findOne({ summit: summit._id, teufelsturmId: { $exists: true, $ne: null } });
        if (route && route.teufelsturmId) {
          const gipfelnr = await getGipfelnrFromRouteWegnr(route.teufelsturmId);
          if (gipfelnr) {
            summit.teufelsturmId = gipfelnr;
            updated = true;
            console.log(`Updated Summit ${summit.name} with teufelsturmId ${gipfelnr}`);
          } else {
            console.warn(YELLOW(`Could not find gipfelnr for Summit ${summit.name} (Route wegnr: ${route.teufelsturmId})`));
          }
        } else {
          console.warn(YELLOW(`No route with teufelsturmId found for Summit ${summit.name}`));
        }
      }
      // Step 2: Update gpsPosition if teufelsturmId is present
      if (summit.teufelsturmId) {
        const gps = await getGpsFromGipfelnr(summit.teufelsturmId);
        if (gps && (
          !summit.gpsPosition ||
          summit.gpsPosition.lng !== gps.lng ||
          summit.gpsPosition.lat !== gps.lat
        )) {
          summit.gpsPosition = gps;
          updated = true;
          console.log(`Updated Summit ${summit.name} with gpsPosition`), gps;
        }
      }
      if (updated) {
        await summit.save();
      }
    }
    console.log('Done updating Summits.');
    process.exit(0);
  } catch (err) {
    console.error(RED('Error updating Summits:'), err);
    process.exit(1);
  }
}

updateGpsPositions(); 