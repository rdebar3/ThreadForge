import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { postThreadToX, getValidXAccessToken, isPro, incrementPostedCount } from '../../../lib/clerk'

export async function POST(req: Request) {
  console.log('[API] /api/x/post called')

  try {
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
      return NextResponse.json({ error: 'Bad body' }, { status: 400 })
    }

    const tweets = Array.isArray(body?.tweets) ? body.tweets : []
    if (tweets.length === 0) {
      return NextResponse.json({ error: 'No tweets' }, { status: 400 })
    }

    console.log('[API] /api/x/post called with', tweets.length, 'tweets')

    const accessToken = await getValidXAccessToken(userId)
    if (!accessToken) {
      return NextResponse.json({ error: 'X account not connected. Please connect your X account from the Scheduler page first.', requireConnect: true }, { status: 400 })
    }

    const postIds = await postThreadToX(accessToken, tweets)

    await incrementPostedCount(userId, 1)

    // text-only minimal: no media, no history save for reliability
    return NextResponse.json({ success: true, postIds })
  } catch (err: any) {
    console.error('[API] /api/x/post error:', err)
    if (err.message === 'CreditsDepleted' || (err.message && err.message.includes('CreditsDepleted'))) {
      return NextResponse.json({ 
        error: 'X API credits depleted. Go to your X Developer Console to add credits and try again.', 
        creditsDepleted: true 
      }, { status: 429 })
    }
    return NextResponse.json({ error: 'Failed to post to X. Try again.' }, { status: 500 })
  }
}
