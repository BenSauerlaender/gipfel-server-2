require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const generateMongoUri = require('../utill/mongoUri');
const bcrypt = require('bcryptjs');

const [,, username, password, roleArg] = process.argv;

if (!username || !password) {
  console.log('Usage: node createUser.js <username> <password> [role]');
  process.exit(1);
}

const role = roleArg === 'admin' ? 'admin' : 'user';

async function main() {
  await mongoose.connect(generateMongoUri());
  const hashedPassword = await bcrypt.hash(password, 10);
  await User.findOneAndUpdate(
    { username },
    { username, password: hashedPassword, role },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`User '${username}' created with role '${role}'.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error creating user:', err);
  process.exit(1);
});
