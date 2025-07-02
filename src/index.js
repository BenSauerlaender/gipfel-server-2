const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const mongoose = require('mongoose');
const { setupChangeStreams } = require('./services/changeStreamService');
const cache = require('memory-cache');

const MONGO_HOST = process.env.MONGO_HOST;
const MONGO_PORT = process.env.MONGO_PORT;
const MONGO_DATABASE = process.env.MONGO_DATABASE;

const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin')

const app = express();

// Restrict CORS to only allow requests from your frontend domain and localhost for dev
app.use(cors({
  origin: 'http://localhost:9000',
  credentials: true // if you use cookies for auth
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api', adminRoutes);

// Server setup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(`mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}?directConnection=true&replicaSet=rs0`);
    console.log('Connected to MongoDB');

    mongoose.set('debug', true);

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