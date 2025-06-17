const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');

const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

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