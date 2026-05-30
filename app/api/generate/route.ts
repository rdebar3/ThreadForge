import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

const MAX_FREE_GENERATIONS = 3

// Simple in-memory rate limiter: userId -> last generation timestamp
// Note: This resets on every serverless cold start / deployment.
// For stronger protection, move this to a database (e.g. Redis or Clerk metadata).
const lastGenerationTime = new Map<string, number>()
const RATE_LIMIT_SECONDS = 45

// Occasional cleanup of old entries (runs roughly every 100 generations)
function cleanupOldEntries() {
  const cutoff = Date.now() - (RATE_LIMIT_SECONDS * 1000 * 10) // keep last 10 rate limit windows
  for (const [userId, timestamp] of lastGenerationTime.entries()) {
    if (timestamp < cutoff) {
      lastGenerationTime.delete(userId)
    }
  }
}

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

    // ============================================
    // RATE LIMITING (prevent abuse)
    // ============================================
    const now = Date.now()
    const lastTime = lastGenerationTime.get(userId) || 0
    const timeSinceLast = (now - lastTime) / 1000

    if (timeSinceLast < RATE_LIMIT_SECONDS) {
      const waitTime = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLast)
      return NextResponse.json({
        error: `Please wait ${waitTime} second${waitTime === 1 ? '' : 's'} before generating again.`,
        rateLimited: true,
        waitSeconds: waitTime,
      }, { status: 429 })
    }

    // Record this generation attempt
    lastGenerationTime.set(userId, now)

    // Occasionally clean up old entries
    if (lastGenerationTime.size > 100) {
      cleanupOldEntries()
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
      // High-signal angles that tend to perform well on X in 2026
      const allAngles = [
        "Contrarian take that challenges popular advice on the topic",
        "Personal story or \"I used to believe... until I tried it\" transformation",
        "Specific mistake you made + what you learned from it",
        "Behind-the-scenes observation or 'what no one talks about'",
        "What actually worked for you after testing (with receipts or specifics)",
        "Counterintuitive insight that goes against conventional wisdom",
        "How the game has changed in 2025–2026 and what to do instead",
        "Common pattern you’ve noticed that most people miss"
      ]

      // Shuffle and pick 4 different angles every time
      const shuffledAngles = [...allAngles].sort(() => Math.random() - 0.5).slice(0, 4)

      const systemPrompt = `You are a sharp, high-signal X poster in 2026. You write threads that actually perform well because they feel like they were written by a real person who spends a lot of time on the platform — not by a content strategist or AI.

### Non-Negotiable Rules:
- Sound like a real human with opinions and texture. Avoid sounding like a "Twitter expert," motivational speaker, or generic thread writer.
- Use natural rhythm. Vary sentence length. Some lines should feel like thinking out loud. Avoid robotic or overly polished pacing.
- Every thread needs a strong, specific, slightly provocative hook. Weak or cliché openers are not allowed.
- Prioritize specificity, personal experience, current platform observations, and contrarian angles over generic or broadly "helpful" advice.
- Strongly avoid overused structures (frameworks, "X things that changed everything", basic numbered lists, "Here's what I learned").
- Number every tweet (1/, 2/, 3/, etc.).
- Keep most tweets short and tight. Good threads have momentum and escalation.
- End with a strong, memorable closer — not a weak summary or soft call-to-action.
- Never sound salesy, corporate, overly polished, or like you're trying too hard to sound smart.

### What Actually Wins on X in 2026:
- Threads that feel honest, specific, and slightly uncomfortable or contrarian.
- Observational takes about how the platform actually works right now (algorithm behavior, audience attention, what gets engagement).
- Personal stories with real texture and specificity (not vague "I used to suck at this").
- "What no one talks about" or behind-the-scenes angles.
- Threads that feel native to current X culture rather than like content templates.

### What You Must Avoid:
- Generic or broadly applicable advice that could apply to almost any topic.
- Overused thread structures and phrasing.
- Weak or cliché hooks and closers.
- "Helpful" or self-help energy. The best threads right now are more observational or opinionated.
- Sounding like you're writing for an audience instead of just saying what you actually think.

Create exactly 4 distinct, high-quality threads on the topic. They should feel meaningfully different from each other in tone and structure. Quality, specificity, and natural voice matter more than hitting a formula.

Return ONLY valid JSON. No other text.

Format:
{
  "threads": [
    {
      "id": 1,
      "title": "Natural, specific title",
      "tweets": ["1/ Strong, specific hook...", "2/ ..."]
    },
    ...
  ]
}`

      const userPrompt = `Topic: ${topic}

Write 4 high-quality, distinct X threads about this topic that feel current and natural in 2026. Avoid generic advice and thread templates. Make them feel like something a real person who actually uses X would post.`

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
          temperature: 0.92,
          max_tokens: 2800,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Grok API error:', response.status, errorText)

        // Only fall back to mock for temporary server-side issues
        if (response.status === 429 || response.status >= 500) {
          console.warn('Grok temporarily unavailable, returning error to user instead of mock')
          return NextResponse.json(
            { 
              error: "The AI is temporarily busy. Please try again in a moment.",
              canRetry: true 
            },
            { status: 503 }
          )
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
            return NextResponse.json(
              { 
                error: "Something went wrong while generating threads. Please try again.",
                canRetry: true 
              },
              { status: 500 }
            )
          }
        } else {
          return NextResponse.json(
            { 
              error: "The AI returned an empty response. Please try again.",
              canRetry: true 
            },
            { status: 502 }
          )
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
      error: "Something went wrong while generating threads. Please try again.",
      canRetry: true
    }, { status: 500 })
  }
}

// Fallback mock generator (now with variation so it's not identical every time)
function generateMockThreads(topic: string): Thread[] {
  const cleanTopic = topic.toLowerCase()

  const templates = [
    {
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
      title: "Bold Opinion",
      tweets: [
        `1/ Hot take on ${cleanTopic}:`,
        `2/ The "beginner friendly" advice is actually keeping most people stuck.`,
        `3/ Real progress requires doing the hard, uncomfortable version early.`,
        `4/ Comfort is the enemy of growth in this game.`,
        `5/ If it feels easy, you're probably not doing it right yet.`,
        `6/ The people who win embrace the discomfort early.`
      ]
    },
    {
      title: "30-Day Experiment",
      tweets: [
        `1/ I ran a 30-day experiment on ${cleanTopic}.`,
        `2/ The results surprised me.`,
        `3/ Here's what actually happened day by day:`,
        `4/ The biggest shift came from something stupidly simple.`,
        `5/ Most people overcomplicate this.`,
        `6/ Save this for when you want real results.`
      ]
    },
    {
      title: "What No One Tells You",
      tweets: [
        `1/ Everyone talks about ${cleanTopic}.`,
        `2/ Almost no one talks about this part.`,
        `3/ It's the real reason most people fail at it.`,
        `4/ Once I figured this out, everything got easier.`,
        `5/ This is the missing piece in almost every thread on the topic.`,
        `6/ Bookmark this.`
      ]
    }
  ]

  // Shuffle templates and pick 4 different ones
  const shuffled = [...templates].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 4).map((template, index) => ({
    id: index + 1,
    title: template.title,
    tweets: template.tweets
  }))
}
