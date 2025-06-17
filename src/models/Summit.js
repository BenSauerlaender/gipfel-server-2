const mongoose = require('mongoose');
const { Schema } = mongoose;

const summitSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  region: {
    type: Schema.Types.ObjectId,
    ref: 'Region'
  },
}, { timestamps: true });

module.exports = mongoose.model('Summit', summitSchema); 