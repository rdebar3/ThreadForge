import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getValidXAccessToken, isPro, incrementPostedCount, postThreadToX } from '../../../lib/clerk'

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

  const accessToken = await getValidXAccessToken(userId)
  if (!accessToken) {
    return NextResponse.json({ error: 'X account not connected. Please connect your X account from the Scheduler page first.', requireConnect: true }, { status: 400 })
  }

  try {
    const postIds = await postThreadToX(accessToken, tweets)

    // Track for Pro+ analytics (increment posted count)
    await incrementPostedCount(userId, 1)

    return NextResponse.json({ success: true, postIds })
  } catch (err: any) {
    console.error('Direct X post failed for user', userId, ':', err)
    return NextResponse.json({ error: err.message || 'Failed to post thread to X' }, { status: 500 })
  }
}
