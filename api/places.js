export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude, query } = req.body

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Location required' })
  }

  try {
    const radius = 1000

    const overpassQuery = `
      [out:json][timeout:10];
      (
        node["amenity"="cafe"](around:${radius},${latitude},${longitude});
        node["amenity"="bar"](around:${radius},${latitude},${longitude});
        node["amenity"="restaurant"](around:${radius},${latitude},${longitude});
        node["amenity"="pub"](around:${radius},${latitude},${longitude});
      );
      out body 20;
    `

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`
    })

    const data = await response.json()

    if (!data.elements) {
      return res.status(500).json({ error: 'No results from OpenStreetMap' })
    }

    const places = data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        name: el.tags.name,
        type: el.tags.amenity,
        address: [
          el.tags['addr:street'],
          el.tags['addr:housenumber']
        ].filter(Boolean).join(' ') || 'Address unavailable',
        latitude: el.lat,
        longitude: el.lon,
        opening_hours: el.tags.opening_hours || null,
        cuisine: el.tags.cuisine || null,
        website: el.tags.website || null
      }))

    res.status(200).json({ places })

  } catch (error) {
    console.error('Overpass error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}