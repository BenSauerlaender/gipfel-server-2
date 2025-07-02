const { climberPipeline } = require("./climber")
const { routePipeline } = require("./route")

const ascentPipeline = [
      {
        $lookup: {
          from: 'routes', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'route',
          as: 'route',
          pipeline: routePipeline
        }
      },
      {
        $lookup: {
          from: 'climbers', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'leadClimber',
          as: 'leadClimber',
          pipeline: climberPipeline
        }
      },
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
            }
          ].push(...climberPipeline),
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
          date: 1,
          route: 1,
          climbers: 1,
          leadClimber: 1,
          isAborted: 1,
          isTopRope: 1,
          isSolo: 1,
          isWithoutSupport: 1,
          notes: 1, 
          populatedClimbers: 0,
        }
      },
      {
        $sort: { date: 1 }
      }
    ]

module.exports = {ascentPipeline}