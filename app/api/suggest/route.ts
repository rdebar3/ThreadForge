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
  const content = Array.isArray(input) ? input.join(' ') : input
  const lower = (title + ' ' + content + ' ' + topic).toLowerCase()
  const emojis: string[] = []
  if (lower.includes('ai') || lower.includes('tech') || lower.includes('tool') || lower.includes('grok')) emojis.push('🤖', '🧠')
  if (lower.includes('growth') || lower.includes('success') || lower.includes('scale') || lower.includes('launch')) emojis.push('🚀', '📈')
  if (lower.includes('fail') || lower.includes('mistake') || lower.includes('learn') || lower.includes('story')) emojis.push('💡', '🔥')
  if (lower.includes('money') || lower.includes('business') || lower.includes('founder')) emojis.push('💰')
  if (emojis.length < 4) emojis.push('✨', '🎯', '💬', '🌟')
  const hashtags: string[] = ['#x', '#twitter', '#buildinpublic']
  if (lower.includes('ai')) hashtags.push('#ai', '#grok')
  if (lower.includes('growth') || lower.includes('founder')) hashtags.push('#growth', '#founders')
  if (lower.includes('launch') || lower.includes('product')) hashtags.push('#startup', '#product')
  if (lower.includes('thread') || lower.includes('tips')) hashtags.push('#threads')
  return {
    emojis: [...new Set(emojis)].slice(0, 6),
    hashtags: [...new Set(hashtags)].slice(0, 8)
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
      system = `You are a premium X/Twitter content strategist specializing in high-engagement threads. For the full thread provided (title + numbered tweets, overall topic: ${topic}), suggest 5-7 highly relevant, visually striking, non-generic emojis that perfectly capture the key ideas, emotions, and moments across the thread (mix visual, emotional, and action emojis; avoid overused ones unless they fit exactly). Suggest 6-10 specific, valuable, non-spammy hashtags that are on-trend for the niche, help discoverability, and feel intentional/premium (mix 1-2 broad + targeted long-tail). 

Return EXACTLY this JSON only, nothing else:
{"emojis": ["🧠","🚀","💡","🎯","✨"], "hashtags": ["#ai"," #buildinpublic","#growth","#founder","#x"]} 

Emojis and hashtags must be directly relevant to the provided thread content. Prioritize quality, specificity, and premium feel.`

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
