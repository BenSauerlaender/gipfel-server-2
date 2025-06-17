const mongoose = require('mongoose');
const { Schema } = mongoose;

const ascentSchema = new Schema({
  date: Date,
  route: {
    type: Schema.Types.ObjectId,
    ref: 'Route'
  },
  climbers: [{
    type: Schema.Types.ObjectId,
    ref: 'Climber',
    default: [],
  }],
  leadClimber: {
    type: Schema.Types.ObjectId,
    ref: 'Climber'
  },
  isAborted: {
    value: {
      type: Boolean,
      default: false
    },
    note: {
      type: String,
      default: ''
    },
  },
  isTopRope: {
    value: {
      type: Boolean,
      default: false
    },
    note: {
      type: String,
      default: ''
    },
  },
  isSolo: {
    value: {
      type: Boolean,
      default: false
    },
    note: {
      type: String,
      default: ''
    },
  },
  notes: {
    type: String,
    default: ''
  },
}, { timestamps: true });

module.exports = mongoose.model('Ascent', ascentSchema); 