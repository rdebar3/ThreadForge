import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isProPlus } from '../../lib/clerk'

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

function extractJsonFromLlm(text: string): string | null {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence && fence[1]) return fence[1].trim()
  const obj = text.match(/\{[\s\S]*\}/)
  return obj ? obj[0] : null
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

  const plus = await isProPlus(userId)
  if (!plus) return NextResponse.json({ error: 'Pro+ required for AI Rewriter' }, { status: 402 })

  const { mode, thread, tweet, custom } = await req.json() as {
    mode: string
    thread?: { title: string; tweets: string[] }
    tweet?: string
    custom?: string
  }

  const apiKey = process.env.XAI_API_KEY?.trim()
  if (!apiKey || apiKey.length < 40) {
    // Demo fallback
    if (tweet) return NextResponse.json({ rewritten: tweet + ' [improved in demo]' })
    if (thread) return NextResponse.json({ rewrittenThread: { title: thread.title, tweets: thread.tweets.map(t => t + ' [rewritten]') } })
  }

  let system = `You are an expert X thread editor using Grok 4.3. Rewrite exactly preserving meaning and number of tweets unless asked to shorten. Return ONLY valid JSON.`
  let userPrompt = ''

  if (tweet && mode) {
    userPrompt = `Rewrite this single tweet to be ${mode}. Custom: ${custom || 'none'}. Tweet: ${tweet}\nReturn {"rewritten": "..."}`
  } else if (thread) {
    userPrompt = `Rewrite the full thread with instruction: ${mode || custom || 'make it punchier and stronger'}.\nTitle: ${thread.title}\nTweets: ${JSON.stringify(thread.tweets)}\nReturn exactly {"title": "...", "tweets": [".."]}`
  }

  try {
    const r = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-4.3',
        messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
        temperature: 0.8,
        max_tokens: 2200,
      }),
    })
    const data = await r.json()
    const content = data.choices?.[0]?.message?.content || ''
    const jsonStr = extractJsonFromLlm(content) || content
    const parsed = JSON.parse(jsonStr)
    return NextResponse.json(parsed)
  } catch (e) {
    // graceful
    if (tweet) return NextResponse.json({ rewritten: tweet })
    return NextResponse.json({ title: thread?.title, tweets: thread?.tweets || [] })
  }
}
