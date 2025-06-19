const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  refreshTokens: [{ type: String }], // Store valid refresh tokens for this user
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema); 