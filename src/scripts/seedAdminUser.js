const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../models/User');
const generateMongoUri = require('../utill/mongoUri');

const mongoUri = generateMongoUri();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

async function seedAdminUser() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ username: ADMIN_USERNAME });
    if (existingAdmin) {
      console.log('Admin user already exists.');
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const adminUser = new User({
      username: ADMIN_USERNAME,
      password: hashedPassword,
      role: 'admin',
      refreshTokens: []
    });
    await adminUser.save();
    console.log(`Admin user created: ${ADMIN_USERNAME}`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding admin user:', err);
    process.exit(1);
  }
}

seedAdminUser(); 