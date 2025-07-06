const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const MONGO_DATABASE = process.env.MONGO_DATABASE;

const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}?directConnection=true&replicaSet=rs0`

async function removeTimestampFields() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const collections = [
      'ascents',
      'climbers', 
      'regions',
      'routes',
      'summits',
      'users'
    ];

    for (const collectionName of collections) {
      console.log(`Removing timestamp fields from ${collectionName}...`);
      
      const result = await mongoose.connection.db.collection(collectionName).updateMany(
        {},
        {
          $unset: {
            createdAt: '',
            updatedAt: ''
          }
        }
      );

      console.log(`Updated ${result.modifiedCount} documents in ${collectionName}`);
    }

    console.log('Successfully removed all timestamp fields from all collections');
    process.exit(0);
  } catch (err) {
    console.error('Error removing timestamp fields:', err);
    process.exit(1);
  }
}

removeTimestampFields();
