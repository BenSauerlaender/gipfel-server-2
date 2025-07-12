const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const mongoose = require('mongoose');
const { setupChangeStreams } = require('./services/changeStreamService');
const cache = require('memory-cache');
const cleanupExpiredTokens = require('./utill/cleanupExpiredTokens');
const generateMongoUri = require('./utill/mongoUri');

const mapRoutes = require('./routes/mapResources');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const { authenticate, isAdmin } = require('./middleware/auth');

const app = express();

// Restrict CORS to only allow requests from your frontend domain and localhost for dev
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : 'http://localhost:9000',
  credentials: true // if you use cookies for auth
}));

app.use(express.json());
app.use(cookieParser());


// Health check endpoint (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.get('/auth-nginx', authenticate, (req, res) => res.sendStatus(200));

app.use('/api/resources', authenticate, apiRoutes);
app.use('/api/resources/map', authenticate, mapRoutes);

app.use('/api/admin', authenticate, isAdmin, adminRoutes);

// Server setup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(generateMongoUri());
    console.log('Connected to MongoDB');

    //mongoose.set('debug', true);

    // Ensure indexes for all models
    const Ascent = require('./models/Ascent');
    const Climber = require('./models/Climber');
    const Region = require('./models/Region');
    const Route = require('./models/Route');
    const Summit = require('./models/Summit');
    const User = require('./models/User');
    await Promise.all([
      Ascent.createIndexes(),
      Climber.createIndexes(),
      Region.createIndexes(),
      Route.createIndexes(),
      Summit.createIndexes(),
      User.createIndexes()
    ]);
    console.log('Indexes ensured for all models');

    // Set up change streams for automatic cache invalidation
    setupChangeStreams();

    // Run cleanup task every hour
    setInterval(() => {
      console.log('Running cleanup task for expired refresh tokens...');
      cleanupExpiredTokens();
    }, 24 * 60 * 60 * 1000); // 1 hour in milliseconds

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  cache.clear();
  mongoose.connection.close();
  process.exit(0);
});

// Only connect to MongoDB and start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;