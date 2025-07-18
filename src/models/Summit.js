const mongoose = require("mongoose");
const { Schema } = mongoose;

const summitSchema = new Schema({
  name: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return !v.includes(",");
      },
      message: "Name cannot contain commas",
    },
  },
  region: {
    type: Schema.Types.ObjectId,
    ref: "Region",
    required: true,
    index: true,
  },
  gpsPosition: {
    lng: Number,
    lat: Number,
  },
  teufelsturmId: {
    type: Number,
    min: [0, "teufelsturmId cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "teufelsturmId must be an integer",
    },
  },
});
summitSchema.index({ name: 1, region: 1 }, { unique: true });

module.exports = mongoose.model("Summit", summitSchema);
