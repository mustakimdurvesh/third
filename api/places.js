export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude } = req.body

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

    res.status(200).json({ places })

  } catch (error) {
    console.error('Places error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}