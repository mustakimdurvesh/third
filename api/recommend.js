export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { places, situation } = req.body

  if (!places || !situation) {
    return res.status(400).json({ error: 'Places and situation required' })
  }

  try {
    const placeSummary = places.slice(0, 15).map((p, i) =>
      `${i + 1}. ${p.name} (${p.type})${p.cuisine ? ', cuisine: ' + p.cuisine : ''}${p.opening_hours ? ', hours: ' + p.opening_hours : ''}`
    ).join('\n')

const prompt = `You are helping someone find the perfect third space — a place to spend time outside home or work.

User's situation: ${situation}

Nearby places:
${placeSummary}

Rules for selection:
- A third space must be somewhere you can sit, stay, and spend time — NOT a quick takeaway, street stall, or fast food stop
- Cafes and coffee shops are ideal third spaces
- Cafes that are well established, have significant number of reviews on popular platforms are ideal
- Restaurants are acceptable only if they have a relaxed atmosphere suitable for lingering
- Bars and pubs are good for evening situations
- Do NOT recommend places that are clearly quick-service, takeaway-only, or street food stalls
- Match the place type to the situation — solo laptop work needs quiet cafes, not busy restaurants
- Only recommend places that genuinely exist in the list — use the exact name as given
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
        max_tokens: 500,
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
        cuisine: place?.cuisine
      }
    })

    res.status(200).json({ recommendations })

  } catch (error) {
  console.error('Recommend error:', error.message)
  console.error('Recommend stack:', error.stack)
  res.status(500).json({ error: error.message })

  }
}
