require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const generateMongoUri = require('../utill/mongoUri');

async function main() {
  await mongoose.connect(generateMongoUri());
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const dump = {};
  for (const coll of collections) {
    const name = coll.name;
    const docs = await db.collection(name).find({}).toArray();
    dump[name] = docs;
    console.log(`Fetched ${docs.length} documents from '${name}'`);
  }

  fs.writeFileSync('dump.json', JSON.stringify(dump, null, 2));
  console.log('All collections dumped to dump.json');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error dumping collections:', err);
  process.exit(1);
});
