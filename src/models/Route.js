const mongoose = require("mongoose");
const { Schema } = mongoose;

const routeSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  teufelsturmId: {
    type: Number,
    min: [0, "teufelsturmId cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "teufelsturmId must be an integer",
    },
  },
  teufelsturmScore: {
    type: Number,
    min: [-3, "teufelsturmId cannot be below -3"],
    max: [3, "teufelsturmId cannot be above 3"],
    validate: {
      validator: Number.isInteger,
      message: "teufelsturmId must be an integer",
    },
  },
  unsecure: {
    type: Boolean,
    default: false,
  },
  stars: {
    type: Number,
    min: [0, "stars cannot be negative"],
    max: [2, "stars cannot be above 2"],
    validate: {
      validator: Number.isInteger,
      message: "stars must be an integer",
    },
  },
  difficulty: {
    type: {
      jump: String,
      RP: String,
      normal: String,
      withoutSupport: String,
    },
    required: true,
  },
  summit: {
    type: Schema.Types.ObjectId,
    ref: "Summit",
    required: true,
    index: true,
  },
});
routeSchema.index({ name: 1, summit: 1 }, { unique: true });

module.exports = mongoose.model("Route", routeSchema);
