const { summitPipeline } = require("./summit")

const routePipeline = [
      {
        $lookup: {
          from: 'summits', // Collection name (lowercase, pluralized)
          localField: 'summit',
          foreignField: '_id',
          as: 'summit',
          pipeline: summitPipeline
        }
      },
      {$unwind: { path: '$summit', preserveNullAndEmptyArrays: true } }, // <--- Add this
      {
        $sort: { name: 1 }
      }
    ]

module.exports = {routePipeline}