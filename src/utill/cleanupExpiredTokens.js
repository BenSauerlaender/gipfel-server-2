const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

async function cleanupExpiredTokens() {
  const users = await User.find({});

  for (const user of users) {
    user.refreshTokens = user.refreshTokens.filter(token => {
      try {
        const payload = jwt.verify(token, JWT_REFRESH_SECRET);
        return payload.exp * 1000 > Date.now(); // Check if token is still valid
      } catch (err) {
        return false; // Remove invalid or expired tokens
      }
    });
    await user.save();
  }

  console.log('Expired refresh tokens cleaned up successfully');
}

module.exports = cleanupExpiredTokens;
