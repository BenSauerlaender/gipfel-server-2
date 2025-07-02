const regionPipeline = [
      {
        $lookup: {
          from: 'summits', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'region',
          as: 'summits'
        }
      },
      {
        $addFields: {
          summitIDs: '$summits._id', // Extract only the _id field from students
          summitCount: { $size: '$summits' },
        }
      },
      {
        $project: {
          name: 1,
          summitIDs: 1,
          summitCount: 1,
          summits: 0 
        }
      },
      {
        $sort: { name: 1 }
      }
    ]
module.exports = {regionPipeline}