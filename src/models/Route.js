const mongoose = require('mongoose');
const { Schema } = mongoose;

const routeSchema = new Schema({
  name:{
    type: String,
    required: true
  },
  teufelsturmId: String,
  teufelsturmScore: String,
  unsecure: Boolean,
  stars: Number,
  difficulty: {
    jump: String,
    RP: String,
    normal: String,
    withoutSupport: String
  },
  summit: {
    type: Schema.Types.ObjectId,
    ref: 'Summit',
    required: true
  },
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema); 