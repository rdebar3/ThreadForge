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

function getFallbackSuggestions(tweet: string, topic: string) {
  const lower = (tweet + ' ' + topic).toLowerCase()
  const emojis: string[] = []
  if (lower.includes('ai') || lower.includes('tech') || lower.includes('tool')) emojis.push('🤖')
  if (lower.includes('growth') || lower.includes('success') || lower.includes('launch')) emojis.push('🚀')
  if (lower.includes('fail') || lower.includes('mistake') || lower.includes('learn')) emojis.push('💡')
  if (emojis.length < 3) emojis.push('😊', '📈', '✨')
  const hashtags: string[] = ['#x', '#twitter']
  if (lower.includes('ai')) hashtags.push('#ai')
  if (lower.includes('growth') || lower.includes('founder')) hashtags.push('#growth')
  if (lower.includes('launch') || lower.includes('product')) hashtags.push('#startup')
  return {
    emojis: emojis.slice(0, 3),
    hashtags: hashtags.slice(0, 3)
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

    const { tweet, topic = '' } = await req.json()

    if (!tweet || typeof tweet !== 'string') {
      return NextResponse.json({ error: 'Tweet is required' }, { status: 400 })
    }

    const apiKey = process.env.XAI_API_KEY?.trim()

    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      const fallback = getFallbackSuggestions(tweet, topic)
      return NextResponse.json(fallback)
    }

    const system = `You suggest engaging emojis and hashtags for X/Twitter posts. For the given tweet below (topic: ${topic}), return EXACTLY this JSON only: {"emojis": ["😊","🚀","💡"], "hashtags": ["#ai","#growth","#founder"]}. 3 emojis max, 3 hashtags max, relevant and not spammy.`

    const userPrompt = `Tweet: ${tweet}`

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
      const fallback = getFallbackSuggestions(tweet, topic)
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
        const fallback = getFallbackSuggestions(tweet, topic)
        return NextResponse.json(fallback)
      }
    }

    const fallback = getFallbackSuggestions(tweet, topic)
    return NextResponse.json(fallback)
  } catch (error) {
    console.error('Suggest error:', error)
    const fallback = getFallbackSuggestions('', '')
    return NextResponse.json(fallback)
  }
}
