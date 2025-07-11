require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const generateMongoUri = require('../utill/mongoUri');

const [,, username, password, roleArg] = process.argv;

if (!username || !password) {
  console.log('Usage: node createUser.js <username> <password> [role]');
  process.exit(1);
}

const role = roleArg === 'admin' ? 'admin' : 'user';

async function main() {
  await mongoose.connect(generateMongoUri());
  const user = new User({ username, password, role });
  User.findOneAndReplace({ username }, user, { upsert: true, new: true });
  console.log(`User '${username}' created with role '${role}'.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error creating user:', err);
  process.exit(1);
});
