import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { IMAGE_STYLE_MODIFIERS, IMAGE_STYLES } from '../../lib/prompts'
import { canUseImageGen, canUseProPlusFeature, markProPlusTrialUsed } from '../../lib/clerk'

// Pro-only endpoint: generates 1-4 relevant images for a generated thread using xAI Imagine API.
// - Strict hasPro check (returns 402 + requireUpgrade for free users)
// - In-memory cooldown (~25s) for Pro users
// - Supports style selection (or auto) via IMAGE_STYLE_MODIFIERS
// - Graceful demo fallback using picsum if no/invalid XAI_API_KEY
// - Used by the "✨ Generate Images" button in main generator and /history for Pro users.
// - xAI images API params: prompt, n (count), resolution (e.g. "1k"), aspect_ratio (e.g. "1:1"). No "size" param (causes 400).

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

    // Pro+ check with one-time trial support
    const featureCheck = await canUseProPlusFeature(userId)
    if (!featureCheck.allowed) {
      return NextResponse.json({
        error: 'Image Generation is a Pro+ feature. You have used your one-time trial.',
        requireUpgrade: true,
        upgradeTo: 'pro-plus'
      }, { status: 402 })
    }

    const isTrialUse = featureCheck.isTrial

    console.log(`[generate-images] Pro user ${userId} requesting style=${style} count=${count} topicLen=${(topic||'').length}`)

    // Rate limit (check only; only consume on successful generation to respect limits without penalizing transient failures)
    const lastTime = lastImageGenerationTime.get(userId) || 0
    const timeSinceLast = (Date.now() - lastTime) / 1000

    if (timeSinceLast < IMAGE_RATE_LIMIT_SECONDS) {
      const waitTime = Math.ceil(IMAGE_RATE_LIMIT_SECONDS - timeSinceLast)
      console.log(`[generate-images] Rate limited for user ${userId}: ${waitTime}s wait`)
      return NextResponse.json({
        error: `Please wait ${waitTime} second${waitTime === 1 ? '' : 's'} before generating more images.`,
        rateLimited: true,
        waitSeconds: waitTime,
      }, { status: 429 })
    }

    console.log(`[generate-images] Rate limit passed for ${userId}, proceeding with generation`)

    const apiKey = process.env.XAI_API_KEY?.trim()

    let images: Array<{ url: string; style: string; revisedPrompt?: string }> = []

    if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
      console.warn(`[generate-images] No valid XAI_API_KEY (len=${(apiKey||'').length}) — returning demo images for ${userId}`)
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
      // Consume rate limit only on success (demo always succeeds here)
      lastImageGenerationTime.set(userId, Date.now())
    } else {
      console.log(`[generate-images] Using real xAI for user ${userId}`)
      // Resolve style (auto picks one at random for this generation)
      let resolvedStyle = cleanStyle
      if (resolvedStyle === 'auto' || !IMAGE_STYLE_MODIFIERS[resolvedStyle]) {
        const nonAuto = Object.keys(IMAGE_STYLE_MODIFIERS).filter(k => k !== 'auto')
        resolvedStyle = nonAuto[Math.floor(Math.random() * nonAuto.length)]
      }
      const modifier = IMAGE_STYLE_MODIFIERS[resolvedStyle] || ''

      const basePrompt = `High-quality, visually striking social media image designed as a companion for an X thread. 

Cinematic scene, atmospheric lighting, minimal text (strongly prefer zero text overlays or at most 0-2 small words if absolutely necessary), symbolic, metaphorical, or abstract visuals preferred over literal depictions. No heavy typography, no cluttered text, no quotes, no logos.

Topic: ${topic}
Thread title: ${title}

Key visual concepts only (do not include full sentences or long text):
${tweets.slice(0, 3).map((t: string) => t.replace(/^\d+\/\s*/, '').substring(0, 80)).join(' • ')}

Style: ${resolvedStyle}${modifier ? ' - ' + modifier : ''}

Create a beautiful, eye-catching, premium cinematic image that captures the emotion and core idea of this thread with atmospheric depth, high visual impact, and professional quality. 
- Strongly avoid any text overlays; use pure visual storytelling, symbolism, scenes, metaphors, or aesthetic representation.
- Clean, modern, cinematic composition
- Perfect for X/Twitter (square format, high visual impact)
- Focus on mood, light, and symbolic elements`

      const fullPrompt = basePrompt

      // xAI images request body (no "size" - causes 400; use "resolution" + optional "aspect_ratio")
      const xaiRequestBody = {
        prompt: fullPrompt,
        n: cleanCount,
        resolution: '1k', // 1k resolution (xAI equivalent to ~1024x1024)
        aspect_ratio: '1:1', // square default; can be made configurable later
      }

      // Defensive fetch with timeout and key re-check
      if (!apiKey || apiKey.length < 40 || !apiKey.startsWith('xai-')) {
        console.warn(`[generate-images] Key became invalid before real call for ${userId}`)
        return NextResponse.json({ error: 'Invalid XAI API key configuration.', canRetry: false }, { status: 500 })
      }

      let imageRes;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error('xAI request timeout')), 30000); // 30s timeout to prevent hangs/502

        imageRes = await fetch(XAI_IMAGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(xaiRequestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        console.error(`[generate-images] Fetch error to xAI for ${userId}:`, fetchError?.message || fetchError, 'requestBody:', JSON.stringify(xaiRequestBody));
        // Do not set rate limit on network/timeout error
        return NextResponse.json({
          error: 'Failed to reach image generation service. Please try again.',
          canRetry: true
        }, { status: 500 });
      }

      if (!imageRes.ok) {
        const errorText = await imageRes.text()
        console.error(`[generate-images] xAI Imagine API error for ${userId}: status=${imageRes.status} body=${errorText.substring(0,300)} requestBodySent=${JSON.stringify(xaiRequestBody)}`)
        // Do not consume rate limit on provider failure. Return proper error (avoid 502 where possible for client UX)
        const isRateLimited = imageRes.status === 429
        return NextResponse.json({
          error: isRateLimited ? 'Image provider is rate limited. Please try again shortly.' : 'Image generation failed. Please try again.',
          canRetry: true,
          rateLimited: isRateLimited
        }, { status: isRateLimited ? 429 : 500 })
      }

      let imageData;
      try {
        imageData = await imageRes.json();
      } catch (parseError: any) {
        console.error(`[generate-images] JSON parse error from xAI for ${userId}:`, parseError?.message);
        return NextResponse.json({ error: 'Invalid response from image service.', canRetry: true }, { status: 500 });
      }

      images = (imageData.data || []).slice(0, cleanCount).map((item: any) => ({
        url: item.url,
        revisedPrompt: item.revised_prompt,
        style: resolvedStyle,
      }))

      if (images.length === 0) {
        console.error(`[generate-images] xAI returned empty images for ${userId}`)
        return NextResponse.json({ error: 'No images generated by provider. Please try again.', canRetry: true }, { status: 500 })
      }

      // Consume rate limit ONLY on successful real generation
      lastImageGenerationTime.set(userId, Date.now())
      console.log(`[generate-images] xAI success for ${userId}: ${images.length} images, style=${resolvedStyle}`)
    }

    if (images.length === 0) {
      console.error(`[generate-images] No images after processing for ${userId}`)
      return NextResponse.json({ error: 'Failed to prepare images. Please try again.', canRetry: true }, { status: 500 })
    }

    console.log(`[generate-images] Success for ${userId}: returning ${images.length} images`)
    const displayStyle = (cleanStyle === 'auto' ? 'auto (randomized to ' + (images[0]?.style || 'default') + ')' : cleanStyle)

    // If this was a trial use, mark it consumed now (after successful generation)
    if (isTrialUse) {
      await markProPlusTrialUsed(userId)
      console.log(`[generate-images] Marked one-time Pro+ trial as used for ${userId}`)
    }

    return NextResponse.json({ 
      images, 
      style: displayStyle,
      wasTrial: isTrialUse
    })

  } catch (error) {
    console.error('[generate-images] Uncaught error:', error)
    return NextResponse.json({
      error: "Something went wrong while generating images. Please try again.",
      canRetry: true
    }, { status: 500 })
  }
}
