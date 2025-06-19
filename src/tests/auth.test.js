const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Authentication Endpoints', () => {
  beforeEach(async () => {
    // Remove all users before each test
    await User.deleteMany({});
    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    await User.create({
      username: 'testuser',
      password: hashedPassword,
      role: 'user',
      refreshTokens: []
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login and return access and refresh tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.username).toBe('testuser');
      expect(res.body.user.role).toBe('user');
      expect(res.body.user._id).toBeDefined();
    });

    it('should not login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });
      expect(res.statusCode).toBe(401);
    });

    it('should not login with non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'testpassword'
        });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/refresh-token', () => {
    it('should refresh access token and rotate refresh token', async () => {
      // Login to get tokens
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });
      const { refreshToken, accessToken } = loginRes.body;
      // Use refresh token to get new tokens
      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');
      expect(refreshRes.body.refreshToken).not.toBe(refreshToken); // Should rotate
    });

    it('should not refresh with invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalidtoken' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and invalidate the refresh token', async () => {
      // Login to get tokens
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'testpassword' });
      const { refreshToken } = loginRes.body;
      // Logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });
      expect(logoutRes.statusCode).toBe(200);
      expect(logoutRes.body).toHaveProperty('message');
      // Try to use the same refresh token again
      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });
      expect(refreshRes.statusCode).toBe(401);
    });
  });
}); 