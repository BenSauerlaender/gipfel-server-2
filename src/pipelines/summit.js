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
          localField: 'region',
          foreignField: '_id',
          as: 'region',
          pipeline: regionPipeline
        }
      },
      {$unwind: { path: '$region', preserveNullAndEmptyArrays: true } }, // <--- Add this
      {
        $addFields: {
          routeIDs: '$routes._id', // Extract only the _id field from students
          routeCount: { $size: '$routes' },
        }
      },
      {
        $project: {
          routes: 0 
        }
      },
      {
        $sort: { name: 1 }
      }
    ]
module.exports = {summitPipeline}