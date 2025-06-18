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

async function importAscents() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const filePath = path.join(dataDir, 'ascents.json');
    const jsonContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(jsonContent);

    for (const ascentData of data.ascents) {
      // Find the summit
      const summit = await Summit.findOne({ name: ascentData.summit });
      if (!summit) {
        console.log(`Summit not found: ${ascentData.summit}`);
        continue;
      }

      // Find the route
      const route = await Route.findOne({ name: ascentData.route, summit: summit });
      if (!route) {
        console.log(`Route not found: ${ascentData.route}`);
        continue;
      }

      // Find or create climbers
      const climberIds = [];
      for (const climberName of ascentData.climbers) {
        const [firstName, lastName] = climberName.split(' ');
        const climber = await Climber.findOneAndUpdate(
          { firstName, lastName },
          { firstName, lastName },
          { upsert: true, new: true }
        );
        await climber.save();
        climberIds.push(climber._id);
      }

      // Get lead climber
      const leadClimber = climberIds[ascentData.leadClimber];

      // Create the ascent
      const ascent = new Ascent({
        date: new Date(ascentData.date),
        route: route._id,
        climbers: climberIds,
        leadClimber: leadClimber,
        isAborted: ascentData.isAborted,
        isTopRope: ascentData.isTopRope,
        isSolo: ascentData.isSolo,
        isWithoutSupport: ascentData.isWithoutSupport,
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