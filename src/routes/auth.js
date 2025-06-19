const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const router = express.Router();

// Secrets and expiry times for JWTs (set these in your environment for security)
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = '15m'; // short-lived
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // long-lived

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user._id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  const tokenId = crypto.randomBytes(16).toString('hex'); // unique per token
  return jwt.sign(
    {
      userId: user._id,
      username: user.username,
      role: user.role,
      jti: tokenId
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

// LOGIN: Issues access token and sets refresh token as httpOnly cookie
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    // Find user and check password
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password.' });
    }
    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    // Store refresh token in DB
    user.refreshTokens.push(refreshToken);
    await user.save();
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // send only over HTTPS in production
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    // Return access token and user info
    res.json({
      accessToken,
      user: { username: user.username, role: user.role, _id: user._id }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REFRESH TOKEN: Issues a new access token (and rotates the refresh token)
router.post('/refresh-token', async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });
    let payload;
    // Verify refresh token
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    // Find user and check if refresh token is valid
    const user = await User.findById(payload.userId);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    // Rotate refresh token: remove old, add new
    user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
    const newRefreshToken = generateRefreshToken(user);
    user.refreshTokens.push(newRefreshToken);
    await user.save();
    // Set new refresh token as httpOnly cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    // Issue new access token
    const accessToken = generateAccessToken(user);
    res.json({ accessToken, user: { username: user.username, role: user.role, _id: user._id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGOUT: Invalidate a refresh token (removes it from DB and clears cookie)
router.post('/logout', async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });
    let payload;
    // Verify refresh token
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }
    // Remove refresh token from user's list
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'Invalid refresh token.' });
    user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
    await user.save();
    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 