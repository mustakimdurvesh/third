export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const photoName = req.query.name
  const maxWidthPx = Math.min(Math.max(Number.parseInt(req.query.maxWidthPx || '900', 10) || 900, 100), 1600)

  if (!photoName || typeof photoName !== 'string' || !photoName.startsWith('places/')) {
    return res.status(400).json({ error: 'Valid photo name required' })
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return res.status(500).json({ error: 'Google Places API key not configured' })
  }

  const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${process.env.GOOGLE_PLACES_API_KEY}`
  return res.redirect(302, mediaUrl)
}
