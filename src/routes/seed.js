const express = require('express');
const Example = require('../models/Example');
const router = express.Router();

// Seed database with dummy data if empty
router.post('/', async (req, res) => {
  try {
    const count = await Example.countDocuments();
    if (count === 0) {
      await Example.insertMany([
        { name: 'Alpha', value: 1 },
        { name: 'Beta', value: 2 },
        { name: 'Gamma', value: 3 }
      ]);
      return res.json({ message: 'Database seeded with dummy data.' });
    } else {
      return res.json({ message: 'Database already contains data.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 