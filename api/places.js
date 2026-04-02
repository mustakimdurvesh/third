function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude, situation } = req.body

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Valid location required' })
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types,places.regularOpeningHours,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.currentOpeningHours'
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
    })

    const data = await response.json()
    console.log('Google places status:', response.status)
    console.log('Google places response:', JSON.stringify(data))

    if (!response.ok || !Array.isArray(data.places)) {
      console.error('Google Places error:', JSON.stringify(data))
      return res.status(response.status || 500).json({ error: data.error?.message || 'No results from Google Places' })
    }

    const places = data.places
      .filter((place) => Number.isFinite(place.location?.latitude) && Number.isFinite(place.location?.longitude))
      .map((place) => ({
        name: place.displayName?.text || 'Unknown',
        type: place.primaryTypeDisplayName?.text || place.types?.[0] || 'cafe',
        address: place.formattedAddress || 'Address unavailable',
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        opening_hours: place.regularOpeningHours?.weekdayDescriptions?.join(', ') || null,
        is_open: place.currentOpeningHours?.openNow ?? null,
        website: place.websiteUri || null,
        rating: place.rating || null,
        total_ratings: place.userRatingCount || null,
        distance: getDistanceMeters(latitude, longitude, place.location.latitude, place.location.longitude)
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
      'street_food',
      'fast food restaurant',
      'indian restaurant',
      'sweet',
      'hotel',
      'convenience',
      'grocery',
      'supermarket'
    ]

    const openPlaces = places.filter((place) => place.is_open !== false)

    const filteredPlaces = openPlaces.filter((place) => {
      if ((situation || '').includes('Quick 30 minutes')) {
        return true
      }

      return !quickStopTypes.some((type) =>
        place.type?.toLowerCase().includes(type) ||
        place.name?.toLowerCase().includes('fast') ||
        place.name?.toLowerCase().includes('quick') ||
        place.name?.toLowerCase().includes('express') ||
        place.name?.toLowerCase().includes('sweet') ||
        place.name?.toLowerCase().includes('hotel')
      )
    })

    return res.status(200).json({ places: filteredPlaces })
  } catch (error) {
    console.error('Places error:', error)
    return res.status(500).json({ error: 'Could not fetch places' })
  }
}
