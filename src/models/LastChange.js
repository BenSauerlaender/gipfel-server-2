const mongoose = require('mongoose');

const LastChangeSchema = new mongoose.Schema({
  collectionName: { type: String, required: true, unique: true },
  lastModified: { type: Date, required: true },
});

module.exports = mongoose.model('LastChange', LastChangeSchema);
