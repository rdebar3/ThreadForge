import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { IMAGE_STYLE_MODIFIERS, IMAGE_STYLES } from '../../lib/prompts'

// Pro-only endpoint: generates 1-4 relevant images for a generated thread using xAI Imagine API.
// - Strict hasPro check (returns 402 + requireUpgrade for free users)
// - In-memory cooldown (~25s) for Pro users
// - Supports style selection (or auto) via IMAGE_STYLE_MODIFIERS
// - Graceful demo fallback using picsum if no/invalid XAI_API_KEY
// - Used by the "✨ Generate Images" button in main generator and /history for Pro users.

const XAI_IMAGE_URL = 'https://api.x.ai/v1/images/generations'

// Simple in-memory rate limiter for image generation (Pro users)
const lastImageGenerationTime = new Map<string, number>()
const IMAGE_RATE_LIMIT_SECONDS = 25

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { 
          error: 'Please sign in to generate images',
          requireAuth: true 
        },
        { status: 401 }
      )
    }

    const { topic, threadId, title, tweets, style = 'auto', count = 4 } = await req.json()

    if (!topic || !title || !Array.isArray(tweets) || tweets.length === 0) {
      return NextResponse.json({ error: 'Topic, title and tweets are required' }, { status: 400 })
    }

    const cleanCount = Math.max(1, Math.min(4, Number(count) || 4))
    let cleanStyle = typeof style === 'string' ? style : 'auto'
    if (!IMAGE_STYLES.includes(cleanStyle as any)) {
      cleanStyle = 'auto'
    }

    // Pro check
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const metadata = user.publicMetadata as { hasPro?: boolean; hasPaid?: boolean }
    const hasPro = metadata?.hasPro === true || metadata?.hasPaid === true

    if (!hasPro) {
      return NextResponse.json({
        error: 'Image generation is a Pro-only feature.',
        requireUpgrade: true
      }, { status: 402 })
    }

    // Rate limit
    const now = Date.now()
    const lastTime = lastImageGenerationTime.get(userId) || 0
    const timeSinceLast = (now - lastTime) / 1000

    if (timeSinceLast < IMAGE_RATE_LIMIT_SECONDS) {
      const waitTime = Math.ceil(IMAGE_RATE_LIMIT_SECONDS - timeSinceLast)
      return NextResponse.json({
        error: `Please wait ${waitTime} second${waitTime === 1 ? '' : 's'} before generating more images.`,
        rateLimited: true,
        waitSeconds: waitTime,
      }, { status: 429 })
    }
    lastImageGenerationTime.set(userId, now)

    const apiKey = process.env.XAI_API_KEY?.trim()

    let images: Array<{ url: string; style: string; revisedPrompt?: string }> = []

    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      console.warn('⚠️ No valid XAI_API_KEY — returning demo images')
      // Demo placeholders (relevant-ish using picsum with seed)
      let demoStyle = cleanStyle
      if (demoStyle === 'auto' || !IMAGE_STYLE_MODIFIERS[demoStyle]) {
        const nonAuto = Object.keys(IMAGE_STYLE_MODIFIERS).filter(k => k !== 'auto')
        demoStyle = nonAuto[Math.floor(Math.random() * nonAuto.length)]
      }
      const seedBase = (threadId || 1) * 7
      images = Array.from({ length: cleanCount }, (_, i) => ({
        url: `https://picsum.photos/id/${(seedBase + i) % 100 + 10}/1024/1024`,
        style: demoStyle,
        revisedPrompt: 'Demo placeholder image (Pro feature requires valid XAI_API_KEY)'
      }))
    } else {
      // Resolve style (auto picks one at random for this generation)
      let resolvedStyle = cleanStyle
      if (resolvedStyle === 'auto' || !IMAGE_STYLE_MODIFIERS[resolvedStyle]) {
        const nonAuto = Object.keys(IMAGE_STYLE_MODIFIERS).filter(k => k !== 'auto')
        resolvedStyle = nonAuto[Math.floor(Math.random() * nonAuto.length)]
      }
      const modifier = IMAGE_STYLE_MODIFIERS[resolvedStyle] || ''

      const basePrompt = `High-quality, visually striking social media image that captures the essence of this X thread.
Topic: ${topic}
Thread title: ${title}
Key excerpts:
${tweets.slice(0, 3).map((t: string, i: number) => `${i + 1}. ${t.replace(/^\d+\/\s*/, '')}`).join('\n')}
The image should be engaging, relevant to the thread's tone, and suitable as a header or illustration for the thread on X.`

      const fullPrompt = basePrompt + (modifier ? ` ${modifier}.` : ' High detail, excellent composition, eye-catching for social media.')

      const imageRes = await fetch(XAI_IMAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          n: cleanCount,
          size: '1024x1024',
        }),
      })

      if (!imageRes.ok) {
        const errorText = await imageRes.text()
        console.error('xAI Imagine API error:', imageRes.status, errorText)
        return NextResponse.json({ error: 'Image generation failed. Please try again.' }, { status: 502 })
      }

      const imageData = await imageRes.json()
      images = (imageData.data || []).slice(0, cleanCount).map((item: any) => ({
        url: item.url,
        revisedPrompt: item.revised_prompt,
        style: resolvedStyle,
      }))
    }

    const displayStyle = (cleanStyle === 'auto' ? 'auto (randomized to ' + (images[0]?.style || 'default') + ')' : cleanStyle)
    return NextResponse.json({ 
      images, 
      style: displayStyle
    })

  } catch (error) {
    console.error('Image generation error:', error)
    return NextResponse.json({
      error: "Something went wrong while generating images. Please try again.",
      canRetry: true
    }, { status: 500 })
  }
}
