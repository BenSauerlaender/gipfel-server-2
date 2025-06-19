const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const mongoose = require('mongoose');

const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict CORS to only allow requests from your frontend domain and localhost for dev
app.use(cors({
  origin: 'http://localhost:9000',
  credentials: true // if you use cookies for auth
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Only connect to MongoDB and start the server if this file is run directly
if (require.main === module) {
  const MONGO_HOST = process.env.MONGO_HOST;
  const MONGO_PORT = process.env.MONGO_PORT;
  const mongoUri = `mongodb://${MONGO_HOST}:${MONGO_PORT}`;

  mongoose.connect(mongoUri)
    .then(() => {
      console.log('Connected to MongoDB');
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err);
      process.exit(1);
    });
}

module.exports = app; 