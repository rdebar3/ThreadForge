import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getValidXAccessToken, isPro, incrementPostedCount, postThreadToX, saveGenerationToHistory } from '../../../lib/clerk'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasProAccess = await isPro(userId)
  if (!hasProAccess) return NextResponse.json({ error: 'Pro subscription required' }, { status: 402 })

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

  const accessToken = await getValidXAccessToken(userId)
  if (!accessToken) {
    return NextResponse.json({ error: 'X account not connected' }, { status: 400 })
  }

  try {
    // Simple version first - text only (we'll add media back once stable)
    const postIds = await postThreadToX(accessToken, tweets)

    await incrementPostedCount(userId, 1)

    // Best effort history save
    try {
      await saveGenerationToHistory(userId, {
        topic: body?.topic || 'Posted Thread',
        threads: [{ id: Date.now(), title: body?.title || 'Thread', tweets }],
        timestamp: new Date().toISOString(),
      })
    } catch (e) {}

    return NextResponse.json({ success: true, postIds })
  } catch (err: any) {
    console.error('Post to X failed:', err)
    if (err.message === 'CreditsDepleted') {
      return NextResponse.json({ error: 'X API credits depleted' }, { status: 429 })
    }
    return NextResponse.json({ 
      error: 'Something went wrong while posting to X. Your work is safe in History.' 
    }, { status: 500 })
  }
}
