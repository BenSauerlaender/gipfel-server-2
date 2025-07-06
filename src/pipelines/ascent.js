const { routePipeline } = require("./route")

const ascentPipeline = [
      {
        $lookup: {
          from: 'routes',
          localField: 'route',
          foreignField: '_id',
          as: 'route',
          pipeline: routePipeline
        }
      },
      {$unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'climbers',
          localField: 'leadClimber',
          foreignField: '_id',
          as: 'leadClimber',
        }
      },
      {$unwind: { path: '$leadClimber', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'climbers',
          let: { climbersList: '$climbers' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$_id', { $map: { input: '$$climbersList', in: '$$this.climber' } }]
                }
              }
            }
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