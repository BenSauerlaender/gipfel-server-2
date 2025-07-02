module.exports = computeTrips = (ascents) => {
    // Group ascents by day (YYYY-MM-DD)
    const ascentsByDay = ascents
        .map(ascent => { return { _id: ascent._id, date: ascent.date } })
        .toSorted((a, b) => new Date(a.date) - new Date(b.date))
        .reduce((grouped, ascent) => {
        const dayString = new Date(ascent.date).toISOString().slice(0, 10)
        if (!grouped[dayString]) grouped[dayString] = []
        grouped[dayString].push(ascent)
        return grouped
        }, {})

    const sortedDays = Object.keys(ascentsByDay).toSorted()
    let trips = []
    let currentTrip = []
    let lastDayDate = null

    // Split days into trips, allowing max 1 off day between
    for (const dayString of sortedDays) {
        const currentDayDate = new Date(dayString)
        if (
        lastDayDate &&
        (currentDayDate - lastDayDate) / (1000 * 60 * 60 * 24) > 4 // more than 3 off day
        ) {
        if (currentTrip.length) trips.push(currentTrip)
        currentTrip = []
        }
        currentTrip.push({ name: dayString, ascents: ascentsByDay[dayString].map(ascent => { return ascent._id })})
        lastDayDate = currentDayDate
    }
    if (currentTrip.length) trips.push(currentTrip)

    // Add trip name (months/year) to each trip
    return trips.map((trip) => {
        const months = [...new Set(trip.map(dayObj => new Date(dayObj.name).toLocaleString('de-DE', { month: 'long' })))]
        const year = new Date(trip[0].name).toLocaleString('de-DE', { year: 'numeric' })
        const name = months.join('/') + ' ' + year
        return {name, days:trip }
    })
}