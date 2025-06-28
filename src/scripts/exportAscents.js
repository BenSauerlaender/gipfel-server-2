const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Ascent = require('../models/Ascent');
const Route = require('../models/Route');
const Climber = require('../models/Climber');
const Summit = require('../models/Summit');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

const dataDir = path.join(__dirname, '../../data/ascents');

async function exportAscents() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Fetch all ascents with populated data
    const ascents = await Ascent.find({})
      .populate({
        path: 'route',
        populate: {
          path: 'summit',
          model: 'Summit'
        }
      })
      .populate('climbers.climber')
      .populate('leadClimber')
      .sort({ date: 1 });

    console.log(`Found ${ascents.length} ascents`);

    // Transform the data to match the original format
    const exportData = {
      ascents: [],
      climbers: {}
    };

    // Build climbers object
    const climberMap = new Map();
    
    for (const ascent of ascents) {
      // Add climbers to the map
      for (const climberData of ascent.climbers) {
        const climber = climberData.climber;
        if (climber) {
          const key = [climber.firstName.slice(0, 3), climber.firstName, climber.lastName];
          climberMap.set(climber._id.toString(), key);
        }
      }
    }

    // Convert climber map to object
    for (const [id, name] of climberMap) {
      exportData.climbers[name[0]] = name[1] + ' ' + name[2];
    }

    // Transform ascents
    for (const ascent of ascents) {
      const ascentData = {
        date: ascent.date.toISOString().split('T')[0], // YYYY-MM-DD format
        number: ascent.date.getMilliseconds(),
        summit: ascent.route.summit.name,
        route: ascent.route.name,
        climbers: ascent.climbers.map(c => {
          const climber = climberMap.get(c.climber._id.toString());
          return (c.isAborted)? '(' + climber[0] + ')' : climber[0];
        }),
        leadClimber: (ascent.leadClimber)? climberMap.get(ascent.leadClimber._id.toString())[0] : undefined,
        isAborted: ascent.isAborted,
        isTopRope: ascent.isTopRope,
        isSolo: ascent.isSolo,
        isWithoutSupport: ascent.isWithoutSupport,
        notes: ascent.notes || undefined
      };

      exportData.ascents.push(ascentData);
    }

    // Write to file
    const filePath = path.join(dataDir, 'out.ascents.json');
    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8');
    
    console.log(`Exported ${exportData.ascents.length} ascents to ${filePath}`);
    console.log(`Exported ${Object.keys(exportData.climbers).length} climbers`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error exporting ascents:', err);
    process.exit(1);
  }
}

exportAscents(); 