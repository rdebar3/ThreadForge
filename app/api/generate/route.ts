import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

const MAX_FREE_GENERATIONS = 3

// High-quality 2026 X thread examples for few-shot prompting.
// These are written to feel like real, sharp, slightly opinionated humans — not AI or "thread writers".
const FEW_SHOT_EXAMPLES = `
EXAMPLE 1 (Audience growth, personal story + contrarian)
Topic: Going from 0 to 10k followers
1/ I didn't actually "grow" my account until I stopped trying to grow it.
2/ For the first eight months I treated every post like a job application. Polished, safe, slightly boring on purpose.
3/ The week I hit 10k I had posted three things that made me nervous to hit send. One was me calling out a big account I used to respect.
4/ The post that actually broke through wasn't strategic. I was annoyed at 1:17am and typed exactly what I thought.
5/ Turns out people are starving for anyone who sounds like they have a spine.
6/ Everything before that was just expensive practice.

EXAMPLE 2 (Posting mistakes + what actually works)
Topic: My biggest posting mistakes in 2025
1/ My worst mistake was thinking people wanted my "frameworks."
2/ I spent six months writing numbered lists that sounded smart and performed like shit.
3/ The stuff that actually spread was messier. Half-formed thoughts. Specific stories about things that pissed me off that week.
4/ One line I wrote in a reply ended up in more bookmarks than my best 9-tweet thread: "Most creators are just performing curiosity."
5/ I still don't fully understand why that one stuck. But I've stopped trying to understand and just write like that more.

EXAMPLE 3 (Viral reflection, honest)
Topic: What I learned from my most viral thread
1/ The thread that got me 2.3 million views was not the one I spent three days on.
2/ It was the one I almost didn't post because it felt too personal and too small.
3/ I wrote it in 11 minutes on my phone while waiting for coffee. It was about the exact moment I realized my old content strategy was dead.
4/ The polished threads I planned got 4k-12k views. The one that came out of nowhere got the rest.
5/ Lesson I'm still trying to internalize: the algorithm rewards emotional specificity more than it rewards effort.

EXAMPLE 4 (Unpopular opinion that performed)
Topic: Unpopular opinions about content that actually performed well
1/ "Post consistently" is some of the worst advice you can give a new account.
2/ I watched three people I respect post absolute garbage every single day for months and go nowhere.
3/ The accounts blowing up right now are the ones that disappeared for two weeks and came back with something that made people stop scrolling.
4/ Consistency without a point of view is just expensive spam.
5/ I'd rather post three times in a month that make people uncomfortable than thirty times that make them nod.

EXAMPLE 5 (Behind the scenes of a launch)
Topic: Behind the scenes of my last product launch
1/ We made $47k in the first 72 hours. The number everyone saw.
2/ What nobody saw: I had a panic attack at 4am the day before we opened the waitlist because the checkout page was broken on mobile.
3/ The thing that actually moved the needle wasn't the landing page copy or the tweet thread. It was one DM I sent to someone who had complained publicly about the exact problem we were solving.
4/ She ended up posting about it unprompted. That single post drove more qualified buyers than our entire ad spend.
5/ Most "launch strategies" are cope for people who don't have something people are already desperate for.

EXAMPLE 6 (Contrarian take on tools/AI in 2026)
Topic: Why I deleted most of my AI writing tools
1/ I used to have seven different AI tools in my workflow. Now I have one.
2/ The more tools I added, the more my writing started sounding like everyone else's.
3/ There's a very specific tone that appears when someone lets the model finish their thoughts. You can feel it in the third paragraph.
4/ I write worse first drafts now on purpose. They have more teeth. Then I only use the model to cut, never to generate.
5/ The people whose writing I still respect in 2026 are the ones who are visibly still doing the thinking themselves.

EXAMPLE 7 (Engagement / replies / current X reality)
Topic: How replies actually work in 2026
1/ I used to treat every reply like it was content. Long, thoughtful, trying to be helpful.
2/ Most of them got almost no traction.
3/ The replies that actually spread were usually shorter, more specific, and a little more opinionated.
4/ Not mean — just clear. People seem to engage more when they can immediately tell where you stand.
5/ I've started writing replies like I'm texting someone who already gets the context. It changed how often people quote or save them.

EXAMPLE 8 (Personal brand / faceless angle)
Topic: Building in public without showing your face
1/ I have 38k followers and exactly zero people know what I look like.
2/ Early on I thought that was a disadvantage. Now I think it's the only reason it worked.
3/ When you're faceless, every post has to stand on its own. You can't rely on personality or parasocial warmth.
4/ That constraint forced me to get good at hooks and specifics faster than any face-haver I know.
5/ The downside is real though. No one will ever defend you when you're wrong. You're just the words on the screen.
6/ I've made peace with that trade-off.

EXAMPLE 9 (Sharp closer example)
Topic: What actually compounds when posting
1/ The metric I stopped tracking was impressions.
2/ Impressions are the participation trophy of this platform. They go up when you post at the right time or say something safe that the algo likes.
3/ What I track now: how many people quote-tweet me when I'm not in the room.
4/ That's the only signal that something I wrote actually changed how someone thinks when I'm not there to perform for them.
5/ Everything else is just the app doing its job.
`

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

      const systemPrompt = `You are one of the highest-quality X thread writers working in 2026. Your threads feel like they were written by a real, sharp, slightly opinionated human who actually uses the platform daily — not by an AI, not by a content strategist, not by someone trying to sell a course.

### Non-Negotiable Quality Standards (Follow These With Zero Exceptions):
- Sound like a specific person with texture, opinions, and a real point of view. Never sound like a generic "Twitter expert" or motivational voice.
- Natural, uneven, human rhythm. Short sentences. Fragments. Lines that feel like someone thinking out loud at 1:40am. Avoid clean, balanced, professional pacing.
- Every single thread needs a strong, specific, slightly uncomfortable or provocative hook in the first tweet. No weak openers, no "In today's world...", no "Most people think...".
- Specificity and personal texture over generic advice. Every good line should feel like it could only have been written by someone who actually lived it.
- Ruthlessly reject formula. No "X things", no "Here's what I learned", no numbered frameworks, no "The biggest lesson is...".
- Number every tweet correctly (1/, 2/, 3/ ...).
- Most tweets should be short and tight, but the thread as a whole must feel developed and substantial. Avoid thin 4-5 tweet threads that feel underdeveloped. Strong threads are usually 6–9 tweets with real escalation and texture.
- The final tweet must be a strong, memorable closer — a punchline, a sharp observation, an uncomfortable realization, or a line that makes the reader sit with it. Never a soft summary or "follow for more".
- Titles must be specific, intriguing, and feel like something a real person would actually use — not generic, not clickbaity, not corporate. Good titles create curiosity without being obvious.
- Prefer honest and insightful perspectives over purely negative or cynical ones. Sharp takes are welcome, but avoid threads that feel mostly like complaining or doomposting.
- Zero salesy, corporate, polished, or "performing for engagement" energy.

### Current 2026 X Reality (Internalize This):
- The platform rewards emotional specificity and honest discomfort more than "value".
- Audiences are exhausted by content that sounds like it was written to perform. They can feel the difference immediately.
- The best threads right now feel like someone texting a friend who already gets it.
- Strong hooks + even stronger closers are non-negotiable. Everything in the middle exists to earn the closer.

### What You Must Avoid At All Costs:
- Any generic or broadly applicable advice that could be copy-pasted to another topic.
- Overused thread structures, frameworks, or "inspirational" phrasing.
- Weak hooks or closers that feel written by committee.
- Helpful/self-help energy.
- Sounding like you're creating "content" instead of just saying what you actually think.
- Safe, balanced, hedged, or overly polished takes.

### STUDY THESE EXAMPLES EXTREMELY CAREFULLY — THIS IS THE QUALITY BAR:
These are real examples of the level you must match or beat. Notice the specificity, the slightly raw voice, the way they avoid every formula, the strength of their closers, and how each one feels like a different human wrote it.

Important: While some examples have edge, most lean honest and insightful rather than purely negative or cynical. Match the quality and specificity, not excessive negativity.

${FEW_SHOT_EXAMPLES}

### CRITICAL DIFFERENTIATION RULE FOR THE 4 THREADS (THIS IS NON-NEGOTIABLE):
You must produce exactly 4 threads that feel like they were written by 4 different sharp people who have genuinely different relationships to the topic. This is one of the most important rules:

- One should feel like an experienced person who has strong opinions and focuses on what actually works after trying many things.
- One should feel like someone who recently had a painful, embarrassing, or eye-opening realization and is still processing it out loud (more raw and reflective).
- One should feel like a quiet, sharp observer who notices subtle patterns most people miss and is almost reluctant to say it publicly.
- One should feel like a clear thinker who can be contrarian when needed, but prefers honest, specific, and useful perspectives over pure negativity.

These four threads must feel like they came from four different humans with different personalities, different levels of heat, and different ways of speaking. Different sentence length, different rhythm, different emotional temperature.

Prioritize honest and insightful takes. Sharpness and edge are good, but avoid threads that are mostly complaining, cynical, or demotivating without real texture or useful observation.

If the four threads feel like they have similar voice, energy, or level of specificity, you have failed this task. Force real differentiation.

Return ONLY valid JSON. No explanations, no markdown, no extra text.

Exact format:
{
  "threads": [
    {
      "id": 1,
      "title": "Short, specific, non-formulaic title that feels like a real person wrote it",
      "tweets": ["1/ Specific, slightly provocative hook that makes people stop...", "2/ ...", "..."]
    },
    ...
  ]
}`

      const userPrompt = `Topic: ${topic}

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
            { role: 'system', content: systemPrompt },
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
          threads = await rewriteThreadsWithGrok(threads, topic, apiKey)
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

// Fallback mock generator — kept simple on purpose. Real generations now go through
// full few-shot + rewriter pipeline for 9+/10 quality.
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

// ============================================
// POST-GENERATION REWRITER (the quality multiplier)
// Takes the first-draft 4 threads and makes them significantly sharper,
// more specific, better rhythm, and stronger closers.
// This is step 3 of the 1-4 quality plan.
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
- Sharpen the hook until it has real stopping power. It should feel specific and slightly provocative.
- Improve rhythm and flow. Remove any stiff, safe, generic, or AI-sounding lines. Add texture, contradictions, or honest details where needed.
- If the thread feels short or underdeveloped (under 6 strong tweets), expand it with more specific texture, observations, or escalation while keeping the voice intact. Do not leave thin threads.
- The closer is the most important part. Make it significantly stronger, sharper, and more memorable than the original. It should feel like the best line in the thread. Never accept a soft, summary-style, or average closer.
- Rewrite weak or generic titles. Titles must feel distinctive, intriguing, and native to how real people title posts on X right now.
- Kill any remaining generic language, "the lesson is", "here's what I learned", frameworks, or content-writer phrasing.
- Reduce excessive negativity. If a thread feels overly cynical or demotivating, add honest texture and useful insight instead of letting it stay purely negative.
- Be brutal about quality. If a line feels safe or average, replace it. Your goal is to make every thread feel like something a sharp person would actually post and be proud of.
- Ensure the thread feels like it was written by one real, slightly opinionated human at 2am who actually believes what they're saying.

You are not polishing. You are elevating. Do not accept mediocre output. Make these threads significantly better than the first draft.

Return ONLY the improved JSON in exactly the same structure as the input. No commentary.`

  // Serialize the 4 threads for the rewriter
  const threadsForRewriter = originalThreads.map(t => ({
    id: t.id,
    title: t.title,
    tweets: t.tweets
  }))

  const rewriterUser = `Original topic: ${topic}

Here are the 4 first-draft threads. Apply the strict editor rules above and make every single one significantly better. Focus especially on:
- Making weak or short threads more developed and textured
- Dramatically improving closers
- Fixing generic or boring titles
- Increasing specificity and edge where it's missing

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

    // Robust JSON extraction
    const jsonString = extractJsonFromLlm(content) || content
    const parsed = JSON.parse(jsonString)
    const improved = parsed.threads

    if (Array.isArray(improved) && improved.length >= 3) {
      // Basic validation that we got usable threads back
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
