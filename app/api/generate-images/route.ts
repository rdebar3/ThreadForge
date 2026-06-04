import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { IMAGE_STYLE_MODIFIERS, IMAGE_STYLES } from '../../lib/prompts'
import { canGenerateImage, incrementImageGeneration } from '../../lib/clerk'

// Imagine Her - Elegant Boudoir AI Image Generator
// Generates 4 (or 1-4) tasteful, elegant, seductive boudoir/lingerie/artistic images.
// - Free users: 3 generations per calendar day (enforced via Clerk metadata + daily reset)
// - Paid (Pro / Unlimited): unlimited
// - Heavy logging for debug
// - xAI Imagine API with elegant base prompt + style modifiers
// - Always tasteful: "elegant, classy, non-explicit, artistic, sensual but sophisticated"

const XAI_IMAGE_URL = 'https://api.x.ai/v1/images/generations'

// In-memory cooldown to prevent spam (30s between any gens)
const lastImageGenerationTime = new Map<string, number>()
const IMAGE_RATE_LIMIT_SECONDS = 30

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ 
        error: 'Please sign in to generate images',
        requireAuth: true 
      }, { status: 401 })
    }

    const body = await req.json()
    const { prompt, style = 'elegant', count = 4, topic, title, tweets } = body

    // Support both new Imagine Her direct mode and legacy thread mode (for compat during pivot)
    const isDirectPrompt = typeof prompt === 'string' && prompt.trim().length > 3
    const cleanCount = Math.max(1, Math.min(4, Number(count) || 4))
    let cleanStyle = typeof style === 'string' ? style : 'elegant'
    if (!IMAGE_STYLES.includes(cleanStyle as any)) {
      cleanStyle = 'elegant'
    }

    // Enforce free daily 3 limit + paid unlimited (heavy logging)
    const limitCheck = await canGenerateImage(userId)
    if (!limitCheck.allowed) {
      const msg = limitCheck.reason === 'daily_limit_reached' 
        ? 'You have reached your free limit of 3 generations today. Upgrade for unlimited.'
        : 'Image generation limit reached.'
      return NextResponse.json({
        error: msg,
        requireUpgrade: true,
        remaining: limitCheck.remaining || 0
      }, { status: 402 })
    }

    console.log(`[generate-images] User ${userId} requesting style=${cleanStyle} count=${cleanCount} directPrompt=${isDirectPrompt}`)

    // Rate limit cooldown (any user)
    const lastTime = lastImageGenerationTime.get(userId) || 0
    const timeSinceLast = (Date.now() - lastTime) / 1000
    if (timeSinceLast < IMAGE_RATE_LIMIT_SECONDS) {
      const waitTime = Math.ceil(IMAGE_RATE_LIMIT_SECONDS - timeSinceLast)
      console.log(`[generate-images] Cooldown for ${userId}: ${waitTime}s`)
      return NextResponse.json({
        error: `Please wait ${waitTime}s before generating more images.`,
        rateLimited: true,
        waitSeconds: waitTime,
      }, { status: 429 })
    }

    const apiKey = process.env.XAI_API_KEY?.trim()
    let images: Array<{ url: string; style: string; revisedPrompt?: string }> = []

    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      console.warn(`[generate-images] No valid XAI_API_KEY — demo images for ${userId}`)
      const demoStyle = cleanStyle
      images = Array.from({ length: cleanCount }, (_, i) => ({
        url: `https://picsum.photos/id/${(i + 30) % 100 + 20}/1024/1024`,
        style: demoStyle,
        revisedPrompt: 'Demo image — add XAI_API_KEY for real elegant boudoir generations'
      }))
      lastImageGenerationTime.set(userId, Date.now())
      await incrementImageGeneration(userId)
    } else {
      console.log(`[generate-images] Real xAI Imagine for ${userId}`)

      let resolvedStyle = cleanStyle
      const modifier = IMAGE_STYLE_MODIFIERS[resolvedStyle] || IMAGE_STYLE_MODIFIERS['elegant'] || ''

      let fullPrompt: string

      if (isDirectPrompt) {
        // Imagine Her elegant boudoir mode - tasteful, classy, sensual
        const base = `Beautiful elegant woman, tasteful boudoir photography, highly artistic and sensual but fully classy and non-explicit, sophisticated pose, soft luxurious lighting, focus on natural beauty, form, and elegance. Delicate lingerie or artistic drapery, high fashion, premium editorial quality, 8k detail, masterpiece, no text, no logos, no explicit nudity or hardcore elements.`
        fullPrompt = `${base} ${prompt}. ${modifier}. Ultra high quality, tasteful, elegant, seductive in the most refined way.`
      } else {
        // Legacy thread support (kept for now)
        const basePrompt = `High-quality, visually striking image. Cinematic, atmospheric, elegant composition. Minimal or no text.
Topic: ${topic || ''}
Title: ${title || ''}
${Array.isArray(tweets) ? tweets.slice(0, 3).map((t: string) => (t || '').replace(/^\d+\/\s*/, '').substring(0, 60)).join(' • ') : ''}
Style: ${resolvedStyle} ${modifier}`
        fullPrompt = basePrompt
      }

      const xaiRequestBody = {
        prompt: fullPrompt,
        n: cleanCount,
        resolution: '1k',
        aspect_ratio: '1:1',
      }

      console.log(`[generate-images] xAI prompt (first 200): ${fullPrompt.substring(0,200)}...`)

      let imageRes
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 35000)
        imageRes = await fetch(XAI_IMAGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(xaiRequestBody),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchErr: any) {
        console.error('[generate-images] xAI fetch error', fetchErr)
        return NextResponse.json({ error: 'Temporary generation issue. Please try again.', canRetry: true }, { status: 500 })
      }

      if (!imageRes.ok) {
        const errorText = await imageRes.text()
        console.error('[generate-images] xAI error', imageRes.status, errorText.substring(0,200))
        const isRate = imageRes.status === 429
        return NextResponse.json({ 
          error: isRate ? 'High demand — please wait 30s and try again.' : 'Image generation temporarily unavailable.',
          canRetry: true 
        }, { status: isRate ? 429 : 500 })
      }

      const imageData = await imageRes.json()
      images = (imageData.data || []).slice(0, cleanCount).map((item: any) => ({
        url: item.url,
        revisedPrompt: item.revised_prompt,
        style: resolvedStyle,
      }))

      if (images.length === 0) {
        return NextResponse.json({ error: 'No images returned. Try a different prompt.', canRetry: true }, { status: 500 })
      }

      lastImageGenerationTime.set(userId, Date.now())
      await incrementImageGeneration(userId)
      console.log(`[generate-images] Success for ${userId}: ${images.length} images`)
    }

    return NextResponse.json({ images, style: cleanStyle })
  } catch (error: any) {
    console.error('[generate-images] Unexpected error', error)
    return NextResponse.json({ error: 'Something went wrong generating images. Please try again.' }, { status: 500 })
  }
}
