export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude, situation } = req.body

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Location required' })
  }

  try {
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types,places.regularOpeningHours,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName'
        },
        body: JSON.stringify({
          includedTypes: [
            'cafe',
            'coffee_shop',
            'bar',
            'wine_bar',
            'pub',
            'restaurant',
            'bakery'
          ],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: {
                latitude,
                longitude
              },
              radius: 1500
            }
          }
        })
      }
    )

    const data = await response.json()
    console.log('Google places status:', response.status)
    console.log('Google places response:', JSON.stringify(data))

    if (!data.places) {
      console.error('Google Places error:', JSON.stringify(data))
      return res.status(500).json({ error: 'No results from Google Places' })
    }

    const places = data.places.map(place => ({
      name: place.displayName?.text || 'Unknown',
      type: place.primaryTypeDisplayName?.text || place.types?.[0] || 'cafe',
      address: place.formattedAddress || 'Address unavailable',
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      opening_hours: place.regularOpeningHours?.weekdayDescriptions?.join(', ') || null,
      website: place.websiteUri || null,
      rating: place.rating || null,
      total_ratings: place.userRatingCount || null
    }))

    const quickStopTypes = [
  'fast_food_restaurant',
  'sandwich_shop',
  'juice_bar',
  'ice_cream_shop',
  'candy_store',
  'convenience_store',
  'grocery_store',
  'supermarket',
  'food_stand',
  'street_food'
]

const filteredPlaces = places.filter(place => {
  if (situation === 'Quick 30 minutes') return true
  return !quickStopTypes.some(type =>
    place.type?.toLowerCase().includes(type) ||
    place.name?.toLowerCase().includes('fast') ||
    place.name?.toLowerCase().includes('quick') ||
    place.name?.toLowerCase().includes('express')
  )
})

res.status(200).json({ places: filteredPlaces })

  } catch (error) {
    console.error('Places error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}