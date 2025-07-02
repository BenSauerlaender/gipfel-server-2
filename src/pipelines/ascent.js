const { climberPipeline } = require("./climber")
const { routePipeline } = require("./route")

const ascentPipeline = [
      {
        $lookup: {
          from: 'routes', // Collection name (lowercase, pluralized)
          localField: 'route',
          foreignField: '_id',
          as: 'route',
          pipeline: routePipeline
        }
      },
      {$unwind: { path: '$route', preserveNullAndEmptyArrays: true } }, // <--- Add this
      {
        $lookup: {
          from: 'climbers', // Collection name (lowercase, pluralized)
          localField: 'leadClimber',
          foreignField: '_id',
          as: 'leadClimber',
          pipeline: climberPipeline
        }
      },
      {$unwind: { path: '$leadClimber', preserveNullAndEmptyArrays: true } }, // <--- Add this
      {
        $lookup: {
          from: 'climbers', // Collection name (lowercase, pluralized)
          let: { climbersList: '$climbers' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$_id', { $map: { input: '$$climbersList', in: '$$this.climber' } }]
                }
              }
            }, ...climberPipeline
          ],
          as: 'populatedClimbers'
        }
      },
      {
        $addFields: {
          climbers: {
            $map: {
              input: '$climbers',
              as: 'climberItem',
              in: {
                $mergeObjects: [
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$populatedClimbers',
                          cond: { $eq: ['$$this._id', '$$climberItem.climber'] }
                        }
                      },
                      0
                    ]
                  },
                  { isAborted: '$$climberItem.isAborted' }
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          populatedClimbers: 0,
        }
      },
      {
        $sort: { date: 1 }
      }
    ]

module.exports = {ascentPipeline}