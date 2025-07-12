require('dotenv').config();
const mongoose = require('mongoose');
const generateMongoUri = require('../utill/mongoUri');

async function main() {
  await mongoose.connect(generateMongoUri());
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  for (const coll of collections) {
    const name = coll.name;
    await db.collection(name).deleteMany({});
    console.log(`Cleared collection '${name}'`);
  }

  await mongoose.disconnect();
  console.log('All collections cleared.');
}

main().catch(err => {
  console.error('Error clearing collections:', err);
  process.exit(1);
});
