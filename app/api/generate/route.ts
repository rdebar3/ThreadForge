import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

const MAX_FREE_GENERATIONS = 3

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { 
          error: 'Please sign in to generate threads',
          requireAuth: true 
        },
        { status: 401 }
      )
    }

    const { topic } = await req.json()

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    // ============================================
    // ENFORCE FREE TIER + PAID STATUS (Server side)
    // ============================================
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const metadata = user.publicMetadata as {
      hasPaid?: boolean
      freeGenerationsUsed?: number
    }

    const hasPaid = metadata?.hasPaid === true
    const used = metadata?.freeGenerationsUsed ?? 0

    if (!hasPaid && used >= MAX_FREE_GENERATIONS) {
      return NextResponse.json({
        error: 'Free generation limit reached',
        limitReached: true,
        used,
        max: MAX_FREE_GENERATIONS,
      }, { status: 402 })
    }

    // Get API key
    const apiKey = process.env.XAI_API_KEY?.trim()

    let threads: Thread[] = []
    let demoMode = false

    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      console.warn('⚠️ No valid XAI_API_KEY found — falling back to demo mode')
      threads = generateMockThreads(topic)
      demoMode = true
    } else {
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

      const userPrompt = `Topic: ${topic}\n\nWrite 4 high-quality, viral-style X threads about this topic.`

      const response = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.85,
          max_tokens: 2800,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Grok API error:', response.status, errorText)

        if (response.status === 429 || response.status >= 500) {
          threads = generateMockThreads(topic)
          demoMode = true
        } else {
          return NextResponse.json(
            { error: "Failed to generate threads" },
            { status: 502 }
          )
        }
      } else {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content

        if (content) {
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            const jsonString = jsonMatch ? jsonMatch[0] : content
            const parsed = JSON.parse(jsonString)
            threads = parsed.threads || []
          } catch (e) {
            console.error('Failed to parse JSON from Grok')
            threads = generateMockThreads(topic)
            demoMode = true
          }
        } else {
          threads = generateMockThreads(topic)
          demoMode = true
        }
      }
    }

    // ============================================
    // INCREMENT FREE GENERATION COUNT (if not paid)
    // ============================================
    if (!hasPaid) {
      const newUsed = used + 1
      try {
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...metadata,
            freeGenerationsUsed: newUsed,
          },
        })
      } catch (err) {
        console.error('Failed to update free generation count:', err)
      }
    }

    return NextResponse.json({ 
      threads, 
      demoMode,
      remaining: hasPaid ? null : Math.max(0, MAX_FREE_GENERATIONS - (used + 1))
    })

  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json({
      threads: generateMockThreads('general topic'),
      demoMode: true
    }, { status: 500 })
  }
}

// Fallback mock generator
function generateMockThreads(topic: string): Thread[] {
  const cleanTopic = topic.toLowerCase()
  return [
    {
      id: 1,
      title: "The Contrarian Take",
      tweets: [
        `1/ Most people get ${cleanTopic} completely wrong.`,
        `2/ They focus on the obvious stuff and miss what actually moves the needle.`,
        `3/ After studying this for months, here's the uncomfortable truth:`,
        `4/ The people winning aren't doing what the gurus are teaching.`,
        `5/ They're doing the boring, unsexy version that actually compounds.`,
        `6/ Save this if you're serious about ${cleanTopic}.`
      ]
    },
    {
      id: 2,
      title: "Story + Lesson",
      tweets: [
        `1/ I used to suck at ${cleanTopic}.`,
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
        `1/ Here's the exact framework I use for ${cleanTopic}:`,
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
        `1/ Hot take on ${cleanTopic}:`,
        `2/ The "beginner friendly" advice is actually keeping most people stuck.`,
        `3/ Real progress requires doing the hard, uncomfortable version early.`,
        `4/ Comfort is the enemy of growth in this game.`,
        `5/ If it feels easy, you're probably not doing it right yet.`,
        `6/ The people who win embrace the discomfort early.`
      ]
    }
  ]
}
