const mongoose = require('mongoose');
const { Schema } = mongoose;

const summitSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  region: {
    type: Schema.Types.ObjectId,
    ref: 'Region',
    required: true
  },
  gpsPosition: {
    lng: Number,
    lat: Number
  },
  teufelsturmId: String
}, { timestamps: true });

module.exports = mongoose.model('Summit', summitSchema); 