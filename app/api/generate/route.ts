import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { SYSTEM_PROMPT } from '../../lib/prompts'
import { incrementUserGenerations } from '../../lib/clerk'

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

// Robust JSON extractor for LLM responses that sometimes wrap in ```json or add extra text
function extractJsonFromLlm(text: string): string | null {
  if (!text) return null
  // Try code fence first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim()
  }
  // Fallback to first balanced-looking top-level object
  const objMatch = text.match(/\{[\s\S]*\}/)
  return objMatch ? objMatch[0] : null
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

    // Basic sanitization and length limits
    const cleanTopic = topic.trim().slice(0, 200)

    if (cleanTopic.length < 3) {
      return NextResponse.json({ error: 'Topic must be at least 3 characters' }, { status: 400 })
    }

    // Real free tier enforcement
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const metadata = user.publicMetadata as {
      hasPaid?: boolean
      hasPro?: boolean
      freeGenerationsUsed?: number
      lastFreeGenerationDate?: string
    }

    const hasPro = metadata?.hasPro === true || metadata?.hasPaid === true

    // Daily reset logic for free tier
    const today = new Date().toISOString().split('T')[0]
    const lastDate = metadata?.lastFreeGenerationDate
    let used = metadata?.freeGenerationsUsed ?? 0

    if (!hasPro && lastDate !== today) {
      // New day — reset free count
      used = 0
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...user.publicMetadata,
          freeGenerationsUsed: 0,
          lastFreeGenerationDate: today,
        },
      })
    }

    // Free users (no Pro) are limited to MAX_FREE_GENERATIONS per day
    if (!hasPro && used >= MAX_FREE_GENERATIONS) {
      return NextResponse.json({
        error: 'You have reached your free daily limit (3 generations). Upgrade to Pro for unlimited access.',
        limitReached: true,
        requireUpgrade: true
      }, { status: 402 })
    }

    // ============================================
    // RATE LIMITING (prevent abuse)
    // Current: In-memory (fast but resets on cold starts).
    // Future improvement: Move to Clerk privateMetadata or Redis for persistence.
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

    // Record this generation attempt (in-memory)
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
      threads = generateMockThreads(cleanTopic)
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

      const userPrompt = `Topic: ${cleanTopic}

Chosen angles for the four threads (use each once, make them feel like they come from four different people):
1. ${shuffledAngles[0]}
2. ${shuffledAngles[1]}
3. ${shuffledAngles[2]}
4. ${shuffledAngles[3]}

Write exactly 4 high-quality, distinct X threads on this topic at the same quality level as the reference examples above.

Each thread must feel developed and substantial (generally 6–9 tweets), not thin or underdeveloped. Strong hooks, real escalation, and genuinely strong closers are required.

Make the four threads feel like they were written by four different humans with different relationships to the topic. Different voices, different heat levels, different rhythms. Force real differentiation.

Titles must be specific and intriguing — never generic or bland.

Do not fall back on any thread formulas. Prioritize honesty, specificity, and edge over being "helpful".`

      const response = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.92,
          max_tokens: 3200,
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
            const jsonString = extractJsonFromLlm(content) || content
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

        // ============================================
        // POST-GENERATION REWRITER (step 3 of quality plan)
        // This is the single biggest lever for making threads feel 9-10/10
        // instead of generic first-draft output.
        // ============================================
        if (threads.length >= 3) {
          console.log(`Running rewriter pass on ${threads.length} threads for topic: "${topic}"`)
          threads = await rewriteThreadsWithGrok(threads, cleanTopic, apiKey)
        }
      }
    }

    // Track usage
    if (userId && threads.length > 0) {
      await incrementUserGenerations(userId, 1)

      // For free (non-Pro) users, track daily free generation count with proper date
      if (!hasPro) {
        const currentFreeUsed = (metadata?.freeGenerationsUsed as number) || 0
        const currentDate = new Date().toISOString().split('T')[0]

        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            ...user.publicMetadata,
            freeGenerationsUsed: currentFreeUsed + 1,
            lastFreeGenerationDate: currentDate,
          },
        })
      }
    }

    // Calculate remaining for client
    const remaining = hasPro ? Infinity : Math.max(0, MAX_FREE_GENERATIONS - (used + 1))

    return NextResponse.json({ 
      threads, 
      demoMode,
      freeGenerationsUsed: !hasPro ? (used + 1) : 0,
      remainingFree: hasPro ? null : remaining,
      isPro: hasPro
    })

  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json({
      error: "Something went wrong while generating threads. Please try again.",
      canRetry: true
    }, { status: 500 })
  }
}

// Fallback mock generator — kept simple on purpose.
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

// ============================================
// POST-GENERATION REWRITER
// ============================================
async function rewriteThreadsWithGrok(
  originalThreads: Thread[],
  topic: string,
  apiKey: string
): Promise<Thread[]> {
  if (!originalThreads || originalThreads.length === 0) {
    return originalThreads
  }

  const rewriterSystem = `You are a ruthless, world-class editor for X threads in 2026. Your only job is to take decent first-draft threads and turn them into excellent, publish-ready ones. Be aggressive and demanding.

You will receive 4 threads + the original topic.

For EACH thread independently, apply these strict rules:
- Keep the core angle and intended voice exactly as-is, but make the execution dramatically better.
- Sharpen the hook until it has real stopping power.
- Improve rhythm and flow. Remove any stiff, safe, generic, or AI-sounding lines.
- If the thread feels short or underdeveloped, expand it with more specific texture.
- The closer is the most important part — make it significantly stronger and more memorable.
- Rewrite weak or generic titles.
- Kill any remaining generic language or content-writer phrasing.
- Be brutal about quality.

Return ONLY the improved JSON in exactly the same structure as the input. No commentary.`

  const threadsForRewriter = originalThreads.map(t => ({
    id: t.id,
    title: t.title,
    tweets: t.tweets
  }))

  const rewriterUser = `Original topic: ${topic}

Here are the 4 first-draft threads. Apply the strict editor rules above and make every single one significantly better.

${JSON.stringify({ threads: threadsForRewriter }, null, 2)}

Return the improved version as valid JSON with the exact same structure.`

  try {
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [
          { role: 'system', content: rewriterSystem },
          { role: 'user', content: rewriterUser }
        ],
        temperature: 0.78,
        max_tokens: 2600,
      }),
    })

    if (!response.ok) {
      console.warn('Rewriter call failed with status', response.status, '— returning original threads')
      return originalThreads
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return originalThreads
    }

    const jsonString = extractJsonFromLlm(content) || content
    const parsed = JSON.parse(jsonString)
    const improved = parsed.threads

    if (Array.isArray(improved) && improved.length >= 3) {
      return improved.map((t: any, idx: number) => ({
        id: t.id || idx + 1,
        title: t.title || originalThreads[idx]?.title || 'Thread',
        tweets: Array.isArray(t.tweets) && t.tweets.length > 0 ? t.tweets : originalThreads[idx]?.tweets || []
      }))
    }

    return originalThreads
  } catch (err) {
    console.warn('Rewriter threw error — falling back to original threads:', err)
    return originalThreads
  }
}
