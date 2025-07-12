require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const generateMongoUri = require('../utill/mongoUri');

async function main() {
  await mongoose.connect(generateMongoUri());
  const db = mongoose.connection.db;
  const dump = JSON.parse(fs.readFileSync('dump.json', 'utf8'));

  for (const [name, docs] of Object.entries(dump)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;
    await db.collection(name).deleteMany({}); // Clear existing data
    await db.collection(name).insertMany(docs);
    console.log(`Restored ${docs.length} documents to '${name}'`);
  }

  await mongoose.disconnect();
  console.log('Restore complete.');
}

main().catch(err => {
  console.error('Error restoring collections:', err);
  process.exit(1);
});
