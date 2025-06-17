const mongoose = require('mongoose');
const { Schema } = mongoose;

const routeSchema = new Schema({
  name: String,
  unsecure: Boolean,
  stars: Number,
  difficulty: {
    jump: String,
    RP: String,
    normal: String,
    alternative: String
  },
  summit: {
    type: Schema.Types.ObjectId,
    ref: 'Summit'
  },
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema); 