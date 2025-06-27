const mongoose = require('mongoose');
const { Schema } = mongoose;

const ascentSchema = new Schema({
  date: Date,
  route: {
    type: Schema.Types.ObjectId,
    ref: 'Route'
  },
  climbers: [{
    climber: {
      type: Schema.Types.ObjectId,
      ref: 'Climber',
    },
    isAborted: {
      type: Boolean,
      default: false
    }
  }],
  leadClimber: {
    type: Schema.Types.ObjectId,
    ref: 'Climber',
    default: null
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
}, { timestamps: true });

module.exports = mongoose.model('Ascent', ascentSchema); 