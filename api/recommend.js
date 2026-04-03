function buildRecommendation(place, reason) {
  return {
    name: place.name,
    reason,
    type: place.type,
    primary_type: place.primary_type,
    types: place.types,
    latitude: place.latitude,
    longitude: place.longitude,
    opening_hours: place.opening_hours,
    current_opening_hours: place.current_opening_hours,
    is_open: place.is_open,
    rating: place.rating,
    distance: place.distance,
    address: place.address,
    photo_url: place.photo_url,
    photo_author_attributions: place.photo_author_attributions
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { places, situation, exclude } = req.body

  if (!Array.isArray(places) || !places.length || !situation) {
    return res.status(400).json({ error: 'Places and situation required' })
  }

  try {
    const placeSummary = places.slice(0, 20).map((place, index) =>
      `${index + 1}. ${place.name} (${place.type})${place.rating ? ', rating: ' + place.rating + '/5 (' + place.total_ratings + ' reviews)' : ''}${place.distance ? ', distance: ' + place.distance + 'm' : ''}${place.opening_hours ? ', hours: ' + place.opening_hours[0] : ''}`
    ).join('\n')

    const prompt = `You are helping someone find the perfect third space, a place to spend time outside home or work. Pick the 3 best matches for this situation.

User's situation: ${situation}

Nearby places:
${placeSummary}

${exclude ? `\nDo NOT recommend any of these already shown places: ${exclude}` : ''}

Strict selection rules:
- ALWAYS prefer coffee shops and cafes over restaurants, sweet shops, or fast food for any situation involving work or solo time
- Coffee shops and cafes with good ratings should be top priority for any situation involving work or solo time
- NEVER recommend quick stop eatery or fast food as a third space
- A third space must allow lingering, not a quick stop
- Match rating weight: prefer places with 4.0+ rating and 400+ reviews over lower rated places
- Only recommend places from the list using their exact names
- If fewer than 3 places genuinely fit, return only the ones that do

Respond ONLY with valid JSON in this exact format, no other text:
{
  "recommendations": [
    {
      "index": 1,
      "name": "Exact place name from the list",
      "reason": "One sentence explaining why this fits the situation"
    }
  ]
}`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    console.log('Groq status:', response.status)
    console.log('Groq response:', JSON.stringify(data))

    if (!response.ok) {
      return res.status(response.status || 500).json({ error: data.error?.message || 'Recommendation request failed' })
    }

    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) {
      return res.status(500).json({ error: 'Empty AI response' })
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response' })
    }

    const recommendations = (parsed.recommendations || [])
      .map((recommendation) => {
        const byIndex = Number.isInteger(recommendation.index)
          ? places[recommendation.index - 1]
          : null
        const byName = places.find((place) => place.name === recommendation.name)
        const matchedPlace = byIndex || byName

        if (!matchedPlace) {
          return null
        }

        return buildRecommendation(matchedPlace, recommendation.reason)
      })
      .filter(Boolean)

    return res.status(200).json({ recommendations })
  } catch (error) {
    console.error('Recommend error:', error.message)
    console.error('Recommend stack:', error.stack)
    return res.status(500).json({ error: error.message })
  }
}
