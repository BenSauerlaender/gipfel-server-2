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
      default: null
    },
  },
  isTopRope: {
    type: Boolean,
    default: false
  },
  isSolo: {
    type: Boolean,
    default: false
  },
  isWithoutSupport: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    default: null
  },
}, { timestamps: true });

module.exports = mongoose.model('Ascent', ascentSchema); 