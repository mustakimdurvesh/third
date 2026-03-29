export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { latitude, longitude, query } = req.body

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Location required' })
  }

  try {
  
    const response = await fetch(
      `https://api.foursquare.com/v3/places/search?ll=${latitude},${longitude}&query=${encodeURIComponent(query)}&radius=1000&limit=15&fields=name,location,categories,hours,distance,rating,photos`,
   

      {
        headers: {
          'Authorization': process.env.FOURSQUARE_API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('Raw Foursquare status:', response.status)
    console.log('Raw Foursquare statusText:', response.statusText)
      console.log('API key present:', !!process.env.FOURSQUARE_API_KEY)
      console.log('Auth header:', process.env.FOURSQUARE_API_KEY?.slice(0, 10) + '...')
    const data = await response.json()
    console.log('Foursquare data:', JSON.stringify(data))

    if (!data.results) {
      console.log('API key present:', !!process.env.FOURSQUARE_API_KEY)
      return res.status(500).json({ error: 'No results from Foursquare' })
    }

    res.status(200).json({ places: data.results })

  } catch (error) {
    console.error('Foursquare error:', error)
    res.status(500).json({ error: 'Could not fetch places' })
  }
}