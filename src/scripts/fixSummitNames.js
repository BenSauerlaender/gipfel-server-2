const mongoose = require('mongoose');
require('dotenv').config();
const Summit = require('../models/Summit');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

async function fixSummitNames() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const summits = await Summit.find({ name: /,/ });
    for (const summit of summits) {
      const parts = summit.name.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const newName = `${parts[1]} ${parts[0]}`;
        console.log(`Renaming summit: '${summit.name}' -> '${newName}'`);
        summit.name = newName;
        await summit.save();
      } else {
        console.warn(`Skipping summit with unexpected format: '${summit.name}'`);
      }
    }
    console.log('Finished fixing summit names.');
    process.exit(0);
  } catch (err) {
    console.error('Error fixing summit names:', err);
    process.exit(1);
  }
}

fixSummitNames(); 