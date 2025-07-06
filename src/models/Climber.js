const mongoose = require('mongoose');
const { Schema } = mongoose;

const climberSchema = new Schema({
  firstName: String,
  lastName: String,
});

module.exports = mongoose.model('Climber', climberSchema); 