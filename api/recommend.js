export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { places, situation } = req.body

  if (!places || !situation) {
    return res.status(400).json({ error: 'Places and situation required' })
  }

  try {
 const placeSummary = filteredPlaces.slice(0, 20).map((p, i) =>
  `${i + 1}. ${p.name} (${p.type})${p.rating ? ', rating: ' + p.rating + '/5 (' + p.total_ratings + ' reviews)' : ''}${p.distance ? ', distance: ' + p.distance + 'm' : ''}${p.opening_hours ? ', hours: ' + p.opening_hours.split(',')[0] : ''}`
).join('\n')
const prompt = `You are helping someone find the perfect third space — a place to spend time outside home or work. Pick the 5 best matches for this situation.

User's situation: ${situation}

Nearby places:
${placeSummary}

Strict selection rules:
- ALWAYS prefer coffee shops and cafes over restaurants, sweet shops, or fast food
- Coffee shops and cafes with good ratings should be top priority for any situation involving work or solo time
- NEVER recommend sweet shops, dessert shops, or fast food as a third space
- NEVER recommend a restaurant over a coffee shop if a coffee shop is available
- A third space must allow lingering — not a quick stop
- Match rating weight: prefer places with 4.0+ rating and 400+ reviews over lower rated places
- Only recommend places from the list using their exact names
- If fewer than 5 places genuinely fit, return only the ones that do

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
    const text = data.choices[0].message.content.trim()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response' })
    }

  const recommendations = parsed.recommendations.map(rec => {
  const place = places[rec.index - 1]
  return {
    name: rec.name,
    reason: rec.reason,
    type: place?.type,
    latitude: place?.latitude,
    longitude: place?.longitude,
    opening_hours: place?.opening_hours,
    rating: place?.rating,
    distance: place?.distance,
    address: place?.address
  }
})

    res.status(200).json({ recommendations })

  } catch (error) {
  console.error('Recommend error:', error.message)
  console.error('Recommend stack:', error.stack)
  res.status(500).json({ error: error.message })

  }
}
