const mongoose = require("mongoose");
const { Schema } = mongoose;

const regionSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  abbr: {
    type: String,
    required: true,
    unique: true,
  },
});

module.exports = mongoose.model("Region", regionSchema);
