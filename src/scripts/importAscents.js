const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const RED = (text) => `\x1b[31m${text}\x1b[0m`;

const Ascent = require('../models/Ascent');
const Route = require('../models/Route');
const Climber = require('../models/Climber');
const Summit = require('../models/Summit');
const generateMongoUri = require('../utill/mongoUri');

const mongoUri = generateMongoUri();

const dataDir = path.join(__dirname, '../../data/ascents');

async function importAscents() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const filePath = path.join(dataDir, 'ascents.real.json');
    const jsonContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(jsonContent);

    await Ascent.deleteMany({});

    for (const ascentData of data.ascents) {
      // Find the summit
      const summit = await Summit.findOne({ name: ascentData.summit });
      if (!summit) {
        console.warn(RED(`Summit not found: ${ascentData.summit}`));
        continue;
      }

      // Find the route
      const route = await Route.findOne({ name: ascentData.route, summit: summit });
      if (!route) {
        console.warn(RED(`Route not found: ${ascentData.route} on ${ascentData.summit}`));
        continue;
      }

      // Find or create climbers
      const climberIds = new Map();
      for (let climberShort of ascentData.climbers) {
        let isAborted = false;
        if(climberShort.startsWith('(')) {
          isAborted = true;
          climberShort = climberShort.slice(1, -1);
        }
        if (!data.climbers[climberShort]) {
          console.warn(RED(`Climber not found: ${climberShort}`));
          continue;
        }
        const [firstName, lastName] = data.climbers[climberShort].split(' ');
        const climber = await Climber.findOneAndUpdate(
          { firstName, lastName },
          { firstName, lastName },
          { upsert: true, new: true }
        );
        await climber.save();
        climberIds.set(climberShort, { climber: climber._id, isAborted: isAborted });
      }

      // Get lead climber
      const leadClimber = climberIds.get(ascentData.leadClimber)?.climber;

      // Create the ascent
      const ascent = new Ascent({
        date: (new Date(ascentData.date)).setMilliseconds(ascentData.number),
        route: route._id,
        climbers: Array.from(climberIds.values()),
        leadClimber: leadClimber,
        isAborted: ascentData.isAborted || false,
        isTopRope: ascentData.isTopRope || false,
        isSolo: ascentData.isSolo || false,
        isWithoutSupport: ascentData.isWithoutSupport || false,
        notes: ascentData.notes
      });

      await ascent.save();
      console.log(`Imported ascent: ${ascentData.route} on ${ascentData.date}`);
    }

    console.log('Successfully imported all ascents');
    process.exit(0);
  } catch (err) {
    console.error('Error importing ascents:', err);
    process.exit(1);
  }
}

importAscents(); 