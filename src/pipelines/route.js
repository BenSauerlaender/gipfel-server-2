const { summitPipeline } = require("./summit")

const routePipeline = [
      {
        $lookup: {
          from: 'summits', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'summit',
          as: 'summit',
          pipeline: summitPipeline
        }
      },
      {
        $project: {
          name: 1,
          teufelsturmId: 1,
          teufelsturmScore: 1,
          unsecure: 1,
          stars: 1,
          difficulty: 1,
          summit: 1
        }
      },
      {
        $sort: { name: 1 }
      }
    ]

module.exports = {routePipeline}