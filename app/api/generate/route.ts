import { NextRequest, NextResponse } from 'next/server'

const XAI_API_KEY = process.env.XAI_API_KEY
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json()

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    if (!XAI_API_KEY) {
      // Fallback to high-quality mock if no API key (for development)
      return NextResponse.json({ 
        threads: generateMockThreads(topic),
        note: "Using demo mode. Add XAI_API_KEY to .env.local for real Grok generation."
      })
    }

    const systemPrompt = `You are a world-class Twitter/X thread writer known for creating highly shareable, natural-sounding threads that perform well.

Core rules for every thread:
- Write like a smart, articulate human — not like an AI or corporate account.
- Use short sentences. Lots of line breaks. Make it easy to read on mobile.
- Strong hook in the very first tweet (question, bold statement, or surprising claim).
- Mix storytelling, contrarian angles, specific insights, and practical value.
- Number every single tweet (1/, 2/, 3/ ...).
- Keep most tweets under 260 characters.
- End with a strong closer, question, or subtle CTA.
- Never sound salesy or generic.

Create exactly 4 distinct threads for the topic. Each thread must use a different angle:
1. Contrarian / Unexpected truth
2. Personal story or "I used to think..." style
3. Clear, actionable framework or steps
4. Strong opinion backed by reasoning or observation

Return ONLY valid JSON. No explanations, no markdown, no extra text outside the JSON.

Format:
{
  "threads": [
    {
      "id": 1,
      "title": "Contrarian Take",
      "tweets": ["1/ hook...", "2/ ..."]
    },
    ...
  ]
}`

    const userPrompt = `Topic: ${topic}

Write 4 high-quality, viral-style X threads about this topic.`

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-2-1212', // or 'grok-beta' depending on what's available
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 2800,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Grok API error:', error)
      return NextResponse.json({ 
        threads: generateMockThreads(topic),
        note: "AI generation failed. Using high-quality demo threads instead."
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({ 
        threads: generateMockThreads(topic),
        note: "Could not parse AI response. Using demo threads."
      })
    }

    // Parse the JSON from Grok's response
    let parsed
    try {
      // Grok sometimes wraps JSON in markdown code blocks
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      const jsonString = jsonMatch ? jsonMatch[0] : content
      parsed = JSON.parse(jsonString)
    } catch (e) {
      console.error('Failed to parse Grok response:', content)
      return NextResponse.json({ 
        threads: generateMockThreads(topic),
        note: "AI returned unexpected format. Using demo threads."
      })
    }

    return NextResponse.json({ threads: parsed.threads || [] })

  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json({ 
      threads: generateMockThreads('general topic'),
      note: "Something went wrong. Using demo threads."
    }, { status: 500 })
  }
}

// Fallback high-quality mock generator (used when no API key)
function generateMockThreads(topic: string): Thread[] {
  return [
    {
      id: 1,
      title: "The Contrarian Take",
      tweets: [
        `1/ Most people get ${topic} completely wrong.`,
        `2/ They focus on the obvious stuff and miss what actually moves the needle.`,
        `3/ After studying this for months, here's the uncomfortable truth:`,
        `4/ The people winning aren't doing what the gurus are teaching.`,
        `5/ They're doing the boring, unsexy version that actually compounds.`,
        `6/ Save this if you're serious about ${topic}.`
      ]
    },
    {
      id: 2,
      title: "Story + Lesson",
      tweets: [
        `1/ I used to suck at ${topic}.`,
        `2/ I tried all the popular advice. Nothing worked.`,
        `3/ Then I tried something different.`,
        `4/ Within 60 days, everything changed.`,
        `5/ Here's exactly what I did differently:`,
        `6/ The biggest lesson? Stop chasing tactics. Start building systems.`
      ]
    },
    {
      id: 3,
      title: "Simple Framework",
      tweets: [
        `1/ Here's the exact framework I use for ${topic}:`,
        `2/ Step 1: Start embarrassingly small.`,
        `3/ Step 2: Focus only on the highest leverage action.`,
        `4/ Step 3: Create fast feedback loops.`,
        `5/ Most people skip step 2 and 3. That's why they stay stuck.`,
        `6/ Do this consistently and results become inevitable.`
      ]
    },
    {
      id: 4,
      title: "Bold Opinion",
      tweets: [
        `1/ Hot take on ${topic}:`,
        `2/ The "beginner friendly" advice is actually keeping most people stuck.`,
        `3/ Real progress requires doing the hard, uncomfortable version early.`,
        `4/ Comfort is the enemy of growth in this game.`,
        `5/ If it feels easy, you're probably not doing it right yet.`,
        `6/ The people who win embrace the discomfort early.`
      ]
    }
  ]
}
