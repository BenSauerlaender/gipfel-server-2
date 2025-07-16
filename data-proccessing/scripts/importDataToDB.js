const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('../config/config.json');
const generateMongoUri = require('../../src/utill/mongoUri');

const Climber = require('../../src/models/Climber');
const Region = require('../../src/models/Region');
const Summit = require('../../src/models/Summit');
const Route = require('../../src/models/Route');
const Ascent = require('../../src/models/Ascent');
const LastChange = require('../../src/models/LastChange');

function loadJsonFiles(files, type) {
  let data = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (type === 'climbers' && Array.isArray(arr) && typeof arr[0] === 'string') {
      arr.forEach(str => {
        if (typeof str === 'string') {
          const parts = str.split(' ');
          data.push({ firstName: parts[0], lastName: parts.slice(1).join(' ') });
        }
      });
    } else if (type === 'regions' && Array.isArray(arr) && typeof arr[0] === 'string') {
      arr.forEach(str => {
        if (typeof str === 'string') {
          data.push({ name: str });
        }
      });
    } else if (Array.isArray(arr)) {
      arr.forEach(item => {
        if (typeof item === 'object' && item !== null) data.push(item);
        else console.warn('Skipped non-object entry:', item);
      });
    } else if (typeof arr === 'object' && arr !== null) {
      data.push(arr);
    } else {
      console.warn('Skipped non-object entry:', arr);
    }
  }
  return data;
}

function logLocationChange(name, oldLoc, newLoc) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371e3; // meters
  if (oldLoc && newLoc && oldLoc.lat != null && oldLoc.lng != null && newLoc.lat != null && newLoc.lng != null) {
    const dLat = toRad(newLoc.lat - oldLoc.lat);
    const dLng = toRad(newLoc.lng - oldLoc.lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(oldLoc.lat)) * Math.cos(toRad(newLoc.lat)) * Math.sin(dLng/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    console.log(`Location for ${name} changed by ${dist.toFixed(2)} meters.`);
  }
}

async function updateLastChange(collectionName) {
  await LastChange.findOneAndUpdate(
    { collectionName },
    { lastModified: new Date() },
    { upsert: true }
  );
  console.log(`LastChange updated for ${collectionName}`);
}

async function importCollection(model, data, uniqueKey, logChange, collectionName) {
  let newCount = 0;
  for (const entry of data) {
    let query = {};
    if (Array.isArray(uniqueKey)) {
      uniqueKey.forEach(key => { query[key] = entry[key]; });
    } else {
      query[uniqueKey] = entry[uniqueKey];
    }
    const existing = await model.findOne(query);
    if (existing) {
      let changed = false;
      for (const key in entry) {
        if (key === '_id') continue;
        if (JSON.stringify(existing[key]) !== JSON.stringify(entry[key])) {
          changed = true;
          if (logChange && key === 'location') logChange(entry[uniqueKey], existing[key], entry[key]);
          else console.log(`${model.modelName} ${JSON.stringify(query)}: '${key}' changed from '${existing[key]}' to '${entry[key]}'`);
          existing[key] = entry[key];
        }
      }
      if (changed) await existing.save();
    } else {
      await model.create(entry);
      newCount++;
    }
  }
  if (newCount > 0) {
    console.log(`Created ${newCount} new ${model.modelName} entries.`);
  }
  await updateLastChange(collectionName);
}

async function importLocations(data) {
  const locationConfig = (config.importDataToDB && config.importDataToDB.config && config.importDataToDB.config.location) || {};
  const logDistanceThreshold = locationConfig.logDistanceThreshold || 0;
  const changeDistanceThreshold = locationConfig.changeDistanceThreshold || 0;
  let updatedCount = 0;
  let skippedCount = 0;
  for (const name in data) {
    const loc = data[name];
    const existing = await Summit.findOne({ name });
    if (existing) {
      let shouldUpdate = false;
      let distance = 0;
      const hasValidExisting = existing.gpsPosition && typeof existing.gpsPosition.lat === 'number' && typeof existing.gpsPosition.lng === 'number';
      const hasValidLoc = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number';
      if (hasValidExisting && hasValidLoc) {
        // Calculate distance
        const toRad = deg => deg * Math.PI / 180;
        const R = 6371e3; // meters
        const dLat = toRad(loc.lat - existing.gpsPosition.lat);
        const dLng = toRad(loc.lng - existing.gpsPosition.lng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(existing.gpsPosition.lat)) * Math.cos(toRad(loc.lat)) * Math.sin(dLng/2)**2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
        if (distance <= changeDistanceThreshold) shouldUpdate = true;
        if (shouldUpdate) {
          existing.gpsPosition = loc;
          await existing.save();
          updatedCount++;
        if (distance >= logDistanceThreshold) {
          console.log(`Location for ${name} changed by ${distance.toFixed(2)} meters.`);
        }
        } else {
            skippedCount++;
            console.warn(`Location for ${name} skipped: distance ${distance.toFixed(2)} meters is above threshold ${changeDistanceThreshold} meters`);
        }
      } else if (!hasValidExisting && hasValidLoc) {
        existing.gpsPosition = loc;
        await existing.save();
        updatedCount++;
      } else if (!hasValidLoc) {
        console.error(`Invalid location data for summit '${name}':`, loc);
        skippedCount++;
      }
    } else {
      console.error(`Summit '${name}' not found. Location not imported.`);
      skippedCount++;
    }
  }
  console.log(`Imported locations for ${updatedCount} summits. Skipped ${skippedCount} locations`);
  await updateLastChange('locations');
}

async function main() {
  await mongoose.connect(generateMongoUri());
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const collections = ['climbers','regions','summits','locations','routes','ascents'];
  const selected = collections.filter(c => args.includes(`--${c}`));
  const toImport = selected.length ? selected : collections;

  if (fresh) {
    for (const model of [Climber, Region, Summit, Route, Ascent]) {
      await model.deleteMany({});
      console.log(`Cleared collection ${model.modelName}`);
    }
    for (const name of collections) {
      await updateLastChange(name);
    }
  }

  if (toImport.includes('climbers')) {
    const climbers = loadJsonFiles(config.importDataToDB.climbers.map(f => path.join(__dirname, '../', f)), 'climbers');
    await importCollection(Climber, climbers, 'firstName', null, 'climbers');
  }
  if (toImport.includes('regions')) {
    const regions = loadJsonFiles(config.importDataToDB.regions.map(f => path.join(__dirname, '../', f)), 'regions');
    await importCollection(Region, regions, 'name', null, 'regions');
  }
  if (toImport.includes('summits')) {
    const summits = loadJsonFiles(config.importDataToDB.summits.map(f => path.join(__dirname, '../', f)));
    // Resolve region names to ObjectIds
    const regions = await Region.find({});
    const regionMap = new Map(regions.map(r => [r.name, r._id]));
    const validSummits = [];
    let skippedCount = 0;
    for (const summit of summits) {
      if (typeof summit.region === 'string') {
        const regionId = regionMap.get(summit.region);
        if (regionId) {
          summit.region = regionId;
          validSummits.push(summit);
        } else {
          console.warn(`Summit '${summit.name}' skipped: region '${summit.region}' not found.`);
          skippedCount++;
        }
      } else if (summit.region) {
        validSummits.push(summit);
      } else {
        console.warn(`Summit '${summit.name}' skipped: missing region.`);
        skippedCount++;
      }
    }
    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} summits due to missing or unmatched region.`);
    }
    await importCollection(Summit, validSummits, 'name', null, 'summits');
  }
  if (toImport.includes('locations')) {
    for (const locFile of config.importDataToDB.locations.map(f => path.join(__dirname, '../', f))) {
      const locData = JSON.parse(fs.readFileSync(locFile, 'utf8'));
      await importLocations(locData);
    }
  }
  if (toImport.includes('routes')) {
    const routes = loadJsonFiles(config.importDataToDB.routes.map(f => path.join(__dirname, '../', f)));
    // Resolve summit names to ObjectIds
    const summits = await Summit.find({});
    const summitMap = new Map(summits.map(s => [s.name, s._id]));
    const validRoutes = [];
    let skippedCount = 0;
    for (const route of routes) {
        route.uniqueKey = `${route.name}_${route.summit}`;
      if (typeof route.summit === 'string') {
        const summitId = summitMap.get(route.summit);
        if (summitId) {
          route.summit = summitId;
        } else {
          console.warn(`Route '${route.name}' skipped: summit '${route.summit}' not found.`);
          skippedCount++;
          continue;
        }
      }
    }
    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} routes due to missing or unmatched summit/name.`);
    }
    await importCollection(Route, validRoutes, 'uniqueKey', null, 'routes');
  }
  if (toImport.includes('ascents')) {
    const ascentsRaw = loadJsonFiles(config.importDataToDB.ascents.map(f => path.join(__dirname, '../', f)));
    let ascentsData = [];
    let climberMap = new Map();
    let skippedCount = 0;
    // Support both {ascents: [], climbers: {}} and flat array
    if (ascentsRaw.length === 1 && ascentsRaw[0].ascents && ascentsRaw[0].climbers) {
      ascentsData = ascentsRaw[0].ascents;
      const climbersObj = ascentsRaw[0].climbers;
      // Query all climbers from DB and build map by short name
      const allClimbers = await Climber.find({});
      for (const short in climbersObj) {
        const fullName = climbersObj[short];
        const found = allClimbers.find(c => `${c.firstName} ${c.lastName}`.trim() === fullName.trim());
        if (found) climberMap.set(short, found._id);
      }
    } else {
      ascentsData = ascentsRaw;
      const allClimbers = await Climber.find({});
      for (const c of allClimbers) {
        climberMap.set(c.firstName, c._id); // fallback: use firstName as short
      }
    }
    // Query all routes and build lookup by summit+route name
    const allRoutes = await Route.find({}).populate('summit');
    function getRouteId(summitName, routeName) {
      const found = allRoutes.find(r => r.name === routeName && r.summit && r.summit.name === summitName);
      return found ? found._id : null;
    }
    const validAscents = [];
    for (const ascent of ascentsData) {
      let routeId = getRouteId(ascent.summit, ascent.route);
      if (!routeId) {
        console.warn(`Ascent skipped: route '${ascent.route}' on summit '${ascent.summit}' not found.`);
        skippedCount++;
        continue;
      }
      let climberObjs = [];
      let missingClimber = false;
      if (Array.isArray(ascent.climbers)) {
        for (let short of ascent.climbers) {
          let isAborted = false;
          // Check for parentheses
          if (typeof short === 'string' && short.startsWith('(') && short.endsWith(')')) {
            isAborted = true;
            short = short.slice(1, -1);
          }
          const climberId = climberMap.get(short);
          if (!climberId) {
            console.warn(`Ascent skipped: climber '${short}' not found.`);
            missingClimber = true;
            break;
          }
          climberObjs.push({ climber: climberId, isAborted });
        }
      }
      if (missingClimber) {
        skippedCount++;
        continue;
      }
      let leadClimberId = null;
      if (ascent.leadClimber) {
        leadClimberId = climberMap.get(ascent.leadClimber);
        if (!leadClimberId) {
          console.warn(`Ascent skipped: leadClimber '${ascent.leadClimber}' not found.`);
          skippedCount++;
          continue;
        }
      }
      let date = new Date(ascent.date);
      if (ascent.number) {
        date = new Date(date.getTime() + Number(ascent.number));
      }
      validAscents.push({
        date,
        route: routeId,
        climbers: climberObjs,
        leadClimber: leadClimberId,
        isAborted: ascent.isAborted || false,
        isTopRope: ascent.isTopRope || false,
        isSolo: ascent.isSolo || false,
        isWithoutSupport: ascent.isWithoutSupport || false,
        notes: ascent.notes || null
      });
    }
    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} ascents due to missing references.`);
    }
    await importCollection(Ascent, validAscents, ['date', 'route', 'leadClimber'], null, 'ascents');
  }
}

main().catch(err => console.error(err)).finally(() => mongoose.disconnect());
