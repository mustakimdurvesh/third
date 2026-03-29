export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude, query } = req.body

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Location required' })
  }

  try {
    const radius = 2000

    const overpassQuery = `
  [out:json][timeout:15];
  (
    node["amenity"="cafe"](around:${radius},${latitude},${longitude});
    node["amenity"="coffee_shop"](around:${radius},${latitude},${longitude});
    node["leisure"="cafe"](around:${radius},${latitude},${longitude});
    node["shop"="coffee"](around:${radius},${latitude},${longitude});
    node["amenity"="bar"](around:${radius},${latitude},${longitude});
    node["amenity"="pub"](around:${radius},${latitude},${longitude});
    node["amenity"="lounge"](around:${radius},${latitude},${longitude});
    node["amenity"="bistro"](around:${radius},${latitude},${longitude});
    node["tourism"="cafe"](around:${radius},${latitude},${longitude});
  );
  out body 30;
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
    type: el.tags.amenity || el.tags.shop || el.tags.leisure || 'cafe',
    address: [
      el.tags['addr:street'],
      el.tags['addr:housenumber']
    ].filter(Boolean).join(' ') || 'Address unavailable',
    latitude: el.lat,
    longitude: el.lon,
    opening_hours: el.tags.opening_hours || null,
    cuisine: el.tags.cuisine || null,
    website: el.tags.website || null,
    wifi: el.tags.internet_access || null,
    outdoor_seating: el.tags.outdoor_seating || null,
    takeaway: el.tags.takeaway || null
  }))

    res.status(200).json({ places })

  } catch (error) {
    console.error('Overpass error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}