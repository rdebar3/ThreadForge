import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getValidXAccessToken, isPro, incrementPostedCount, postThreadToX, saveGenerationToHistory, uploadMediaToX } from '../../../lib/clerk'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasProAccess = await isPro(userId)
  if (!hasProAccess) {
    return NextResponse.json({ error: 'Pro subscription required to post to X.', requireUpgrade: true }, { status: 402 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const tweets = Array.isArray(body?.tweets) ? body.tweets : []
  if (tweets.length === 0) {
    return NextResponse.json({ error: 'No tweets to post' }, { status: 400 })
  }

  // Image pool + per-tweet assignments from the Preview & Edit modal (single or multi via number[])
  const images = Array.isArray(body?.images) ? body.images : []
  const mediaAssignments: Record<number, number | number[]> = body?.mediaAssignments || {}
  const title = typeof body?.title === 'string' ? body.title : 'Posted Thread'
  const postTopic = typeof body?.topic === 'string' ? body.topic : 'Posted thread'

  const accessToken = await getValidXAccessToken(userId)
  if (!accessToken) {
    return NextResponse.json({ error: 'X account not connected. Please connect your X account from the Scheduler page first.', requireConnect: true }, { status: 400 })
  }

  try {
    // 1. Upload any assigned images to X (before posting tweets) to obtain media_ids.
    // Assignments: { tweetIndexInCleanedList: imageIndexInPool or array of them }
    // We support multiple images per tweet (X allows up to 4).
    const tweetMediaIds: Record<number, string[]> = {}
    for (const [tweetIdxStr, imgIdxOrArr] of Object.entries(mediaAssignments)) {
      const tIdx = parseInt(tweetIdxStr, 10)
      if (isNaN(tIdx) || tIdx < 0 || tIdx >= tweets.length) continue
      const idxs = Array.isArray(imgIdxOrArr) ? imgIdxOrArr : (imgIdxOrArr != null ? [imgIdxOrArr] : [])
      const ids: string[] = []
      for (const poolIdx of idxs) {
        const img = images[poolIdx]
        if (!img?.url) continue
        try {
          const mediaId = await uploadMediaToX(accessToken, img.url)
          ids.push(mediaId)
          console.log(`[x/post] Uploaded media ${mediaId} for tweet #${tIdx}`)
        } catch (upErr: any) {
          console.error(`[x/post] Media upload failed for tweet #${tIdx} (poolIdx ${poolIdx}):`, upErr?.message || upErr)
          // Continue without this image; do not fail the entire thread
        }
      }
      if (ids.length > 0) {
        tweetMediaIds[tIdx] = ids
      }
    }

    // 2. Build rich items for the shared poster (text + optional mediaIds per tweet)
    const items = tweets.map((text: string, i: number) => ({
      text,
      ...(tweetMediaIds[i]?.length ? { mediaIds: tweetMediaIds[i] } : {}),
    }))

    // 3. Post the full chain (root + replies), now with media attached where assigned
    const postIds = await postThreadToX(accessToken, items)

    // Track for Pro+ analytics (increment posted count)
    await incrementPostedCount(userId, 1)

    // Save the (possibly edited) thread + attached images to history so images are persisted with the thread history
    // (images list saved even if some uploads failed; the actual X thread has the successfully attached ones)
    try {
      const postedThread = {
        id: Date.now(),
        title,
        tweets,
        ...(images.length > 0 ? { images } : {}),
      }
      await saveGenerationToHistory(userId, {
        topic: postTopic,
        threads: [postedThread],
        timestamp: new Date().toISOString(),
      })
    } catch (histErr) {
      // History save is best-effort; do not fail the post
      console.error('[x/post] Failed to save posted thread+images to history (non-fatal):', histErr)
    }

    return NextResponse.json({ success: true, postIds, mediaAttached: Object.keys(tweetMediaIds).length > 0 })
  } catch (err: any) {
    console.error('Direct X post failed for user', userId, ':', err)
    const errMsg = err.message || 'Failed to post thread to X'
    if (errMsg === 'CreditsDepleted' || errMsg.includes('CreditsDepleted')) {
      return NextResponse.json({ 
        error: 'X API credits depleted. Go to your X Developer Console to add credits and try again.', 
        creditsDepleted: true 
      }, { status: 429 })
    }
    // Pass through improved X API error messages (including reply_settings validation etc.)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
