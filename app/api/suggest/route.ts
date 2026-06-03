import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isPro } from '../../lib/clerk'

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'

function extractJsonFromLlm(text: string): string | null {
  if (!text) return null
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim()
  }
  const objMatch = text.match(/\{[\s\S]*\}/)
  return objMatch ? objMatch[0] : null
}

function getFallbackSuggestions(input: string | string[], title: string, topic: string) {
  const tweets = Array.isArray(input) ? input : [input || '']
  const content = tweets.join(' ')
  const lower = (title + ' ' + content + ' ' + topic).toLowerCase()
  // Per-tweet emojis (1 max per tweet, tasteful based on content)
  const perTweetEmojis: string[] = tweets.map((t, i) => {
    const tLower = (title + ' ' + t + ' ' + topic).toLowerCase()
    if (tLower.includes('ai') || tLower.includes('tech') || tLower.includes('tool') || tLower.includes('grok')) return '🤖'
    if (tLower.includes('growth') || tLower.includes('success') || tLower.includes('scale') || tLower.includes('launch')) return '🚀'
    if (tLower.includes('fail') || tLower.includes('mistake') || tLower.includes('learn') || tLower.includes('story')) return '💡'
    if (tLower.includes('money') || tLower.includes('business') || tLower.includes('founder')) return '💰'
    const defaults = ['✨', '🎯', '🌟', '💬']
    return defaults[i % defaults.length]
  })
  const hashtags: string[] = ['#x', '#buildinpublic']
  if (lower.includes('ai')) hashtags.push('#ai')
  if (lower.includes('growth') || lower.includes('founder')) hashtags.push('#growth')
  if (lower.includes('launch') || lower.includes('product')) hashtags.push('#startup')
  if (lower.includes('thread') || lower.includes('tips')) hashtags.push('#threads')
  // limit to 2-4 strategic
  const finalHashtags = [...new Set(hashtags)].slice(0, 4)
  return {
    emojis: perTweetEmojis,  // exactly one per tweet
    hashtags: finalHashtags
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const hasProAccess = await isPro(userId)

    if (!hasProAccess) {
      return NextResponse.json({ error: 'Pro subscription required for suggestions' }, { status: 403 })
    }

    const { tweet, tweets, title = '', topic = '' } = await req.json()

    const isThreadMode = Array.isArray(tweets) && tweets.length > 0

    if (!isThreadMode && (!tweet || typeof tweet !== 'string')) {
      return NextResponse.json({ error: 'Tweet or tweets array is required' }, { status: 400 })
    }

    const apiKey = process.env.XAI_API_KEY?.trim()

    const fullInputForFallback = isThreadMode ? tweets : tweet
    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      const fallback = getFallbackSuggestions(fullInputForFallback, title, topic)
      return NextResponse.json(fallback)
    }

    let system: string
    let userPrompt: string

    if (isThreadMode) {
      const threadText = tweets.map((t: string, idx: number) => `${idx + 1}. ${t}`).join('\n')
      system = `You are a premium X/Twitter content strategist specializing in high-engagement threads. For the full thread provided (title + numbered tweets, overall topic: ${topic}), intelligently suggest EXACTLY one tasteful, relevant emoji per tweet (N emojis for N tweets). Emojis must enhance the emotion/tone of that specific tweet naturally, placed at the end without distracting or breaking flow/readability. Never spammy or overdone. 

Also suggest 2-4 strategic, relevant hashtags for the overall thread message (on-trend for niche, help discoverability, feel professional/intentional, mix broad + specific).

Return EXACTLY this JSON only, nothing else:
{"emojis": ["😊", "🚀", "💡"], "hashtags": ["#ai", "#growth"]} 

Emojis array length MUST exactly match number of tweets. Hashtags 2-4 max. Prioritize natural, high-quality, clean/professional feel.`

      userPrompt = `Thread title: ${title || 'Untitled'}\n\nFull thread:\n${threadText}`
    } else {
      system = `You suggest engaging emojis and hashtags for X/Twitter posts. For the given tweet below (topic: ${topic}), return EXACTLY this JSON only: {"emojis": ["😊","🚀","💡"], "hashtags": ["#ai","#growth","#founder"]}. 3 emojis max, 3 hashtags max, relevant and not spammy.`
      userPrompt = `Tweet: ${tweet}`
    }

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.3', // Upgraded to Grok 4.3 for better suggestion quality
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      const fallback = getFallbackSuggestions(fullInputForFallback, title, topic)
      return NextResponse.json(fallback)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (content) {
      const jsonString = extractJsonFromLlm(content) || content
      try {
        const parsed = JSON.parse(jsonString)
        return NextResponse.json({
          emojis: parsed.emojis || [],
          hashtags: parsed.hashtags || []
        })
      } catch (e) {
        const fallback = getFallbackSuggestions(fullInputForFallback, title, topic)
        return NextResponse.json(fallback)
      }
    }

    const fallback = getFallbackSuggestions(fullInputForFallback, title, topic)
    return NextResponse.json(fallback)
  } catch (error) {
    console.error('Suggest error:', error)
    const fallback = getFallbackSuggestions('', '', '')
    return NextResponse.json(fallback)
  }
}
