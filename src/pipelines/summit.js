const summitPipeline = [
      {
        $lookup: {
          from: 'routes', 
          localField: '_id',
          foreignField: 'summit',
          as: 'routes'
        }
      },
      {
        $lookup: {
          from: 'regions', 
          localField: 'region',
          foreignField: '_id',
          as: 'regionData'
        }
      },
      {$unwind: { path: '$regionData', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          regionId: '$region',
          regionName: '$regionData.name',
          routeCount: { $size: '$routes' },
        }
      },
      {
        $project: {
          routes: 0, 
          regionData: 0,
          region: 0
        }
      },
      {
        $sort: { name: 1 }
      }
    ]
module.exports = {summitPipeline}