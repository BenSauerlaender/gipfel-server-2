const climberPipeline = [
      {
        $lookup: {
          from: 'ascents', // Collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'climbers.climber',
          as: 'ascentsData'
        }
      },
      {
        $addFields: {
          ascentsCount: { $size: '$ascentsData' },
        }
      },
      {
        $project: {
          ascentsData: 0
        }
      },
      {
        $sort: { ascentsCount: 1 }
      }
    ]
module.exports = {climberPipeline}