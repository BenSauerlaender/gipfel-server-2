const {regionPipeline} = require('./region')

const summitPipeline = [
      {
        $lookup: {
          from: 'routes', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'summit',
          as: 'routes'
        }
      },
      {
        $lookup: {
          from: 'regions', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'region',
          as: 'region',
          pipeline: regionPipeline
        }
      },
      {
        $addFields: {
          routeIDs: '$routes._id', // Extract only the _id field from students
          routeCount: { $size: '$routes' },
        }
      },
      {
        $project: {
          name: 1,
          region: 1,
          gpsPosition: 1,
          teufelsturmId: 1,
          routeIDs: 1,
          routeCount: 1,
          routes: 0 
        }
      },
      {
        $sort: { name: 1 }
      }
    ]
module.exports = {summitPipeline}