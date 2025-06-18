const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('Authentication Endpoints', () => {
  beforeEach(async () => {
    // Create a test user before each test
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    await User.create({
      username: 'testuser',
      password: hashedPassword,
      role: 'user'
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
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
}); 