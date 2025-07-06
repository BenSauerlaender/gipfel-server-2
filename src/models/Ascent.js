const mongoose = require('mongoose');
const { Schema } = mongoose;

const ascentSchema = new Schema({
  date: Date,
  route: {
    type: Schema.Types.ObjectId,
    ref: 'Route',
    index: true,
  },
  climbers: [{
    climber: {
      type: Schema.Types.ObjectId,
      ref: 'Climber',
      index: true,
    },
    isAborted: {
      type: Boolean,
      default: false
    }
  }],
  leadClimber: {
    type: Schema.Types.ObjectId,
    ref: 'Climber',
    default: null,
    index: true,
  },
  isAborted: {
    type: Boolean,
    default: false
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
});

module.exports = mongoose.model('Ascent', ascentSchema); 