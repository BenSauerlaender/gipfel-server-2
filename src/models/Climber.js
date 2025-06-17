const mongoose = require('mongoose');
const { Schema } = mongoose;

const climberSchema = new Schema({
  firstName: String,
  lastName: String,
}, { timestamps: true });

module.exports = mongoose.model('Climber', climberSchema); 