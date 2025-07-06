const routePipeline = [
      {
        $lookup: {
          from: 'summits',
          localField: 'summit',
          foreignField: '_id',
          as: 'summitData',
        }
      },
      {$unwind: { path: '$summitData', preserveNullAndEmptyArrays: true } }, 
      {
        $lookup: {
          from: 'regions', 
          localField: 'summitData.region',
          foreignField: '_id',
          as: 'regionData'
        }
      },
      {$unwind: { path: '$regionData', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          summitID: '$summit',
          summitName: '$summitData.name',
          regionID: '$summitData.region',
          regionName: '$regionData.name',
        }
      },
      {
        $project: {
          summitData: 0,
          summit: 0,
          regionData: 0,
          region: 0
        }
      },
      {
        $sort: { name: 1 }
      }
    ]

const routesBySummitPipeline = [
      ...routePipeline,
      {
        $group: {
          _id: '$summitID',
          routes: { $push: '$$ROOT' }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $arrayToObject: [
              [
                {
                  k: { $toString: '$_id' },
                  v: '$routes'
                }
              ]
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          result: { $mergeObjects: '$$ROOT' }
        }
      },
      {
        $replaceRoot: { newRoot: '$result' }
      }
    ]

module.exports = {routePipeline, routesBySummitPipeline}