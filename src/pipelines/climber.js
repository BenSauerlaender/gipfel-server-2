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
          firstName: 1,
          lastName: 1,
          ascentIDs: 1,
          ascentsCount: 1,
          ascents: 0 
        }
      },
      {
        $sort: { ascentsCount: 1 }
      }
    ]
module.exports = {climberPipeline}