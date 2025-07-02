const climberPipeline = [
      {
        $lookup: {
          from: 'ascents', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'climbers.climber',
          as: 'ascents'
        }
      },
      {
        $addFields: {
          ascentIDs: '$ascents._id', // Extract only the _id field from students
          ascentsCount: { $size: '$ascents' },
        }
      },
      {
        $project: {
          ascents: 0 
        }
      },
      {
        $sort: { ascentsCount: 1 }
      }
    ]
module.exports = {climberPipeline}