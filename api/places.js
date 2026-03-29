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
      `https://discover.search.hereapi.com/v1/discover?at=${latitude},${longitude}&q=cafe+bar+coffee&limit=20&apiKey=${process.env.HERE_API_KEY}`,
    )

    const data = await response.json()

    if (!data.items) {
      return res.status(500).json({ error: 'No results from HERE' })
    }

    const places = data.items.map(item => ({
      name: item.title,
      type: item.categories?.[0]?.name || 'cafe',
      address: item.address?.label || 'Address unavailable',
      latitude: item.position?.lat,
      longitude: item.position?.lng,
      distance: item.distance,
      opening_hours: item.openingHours?.[0]?.text?.join(', ') || null,
      website: item.contacts?.[0]?.www?.[0]?.value || null
    }))

    res.status(200).json({ places })

  } catch (error) {
    console.error('HERE error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}