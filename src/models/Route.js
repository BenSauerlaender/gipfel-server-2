const mongoose = require("mongoose");
const { JUMP_SCALA, SCALA } = require("../constants");
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
    type: String,
    enum: ["-3", "-2", "-1", "0", "1", "2", "3"],
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
      jump: {
        type: String,
        enum: JUMP_SCALA,
      },
      RP: {
        type: String,
        enum: SCALA,
      },
      normal: {
        type: String,
        enum: SCALA,
      },
      withoutSupport: {
        type: String,
        enum: SCALA,
      },
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
