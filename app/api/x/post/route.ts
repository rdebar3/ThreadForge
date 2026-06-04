import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getValidXAccessToken, isPro, incrementPostedCount, postThreadToX } from '../../../lib/clerk'

export async function POST(req: NextRequest) {
  console.log('[x/post] API called - START')

  const { userId } = await auth()
  if (!userId) {
    console.log('[x/post] No userId')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasPro = await isPro(userId)
  if (!hasPro) {
    console.log('[x/post] Not Pro')
    return NextResponse.json({ error: 'Pro required' }, { status: 402 })
  }

  let body: any
  try {
    body = await req.json()
    console.log('[x/post] Body received, tweets count:', body?.tweets?.length || 0)
  } catch {
    console.log('[x/post] Bad JSON body')
    return NextResponse.json({ error: 'Bad body' }, { status: 400 })
  }

  const tweets = Array.isArray(body?.tweets) ? body.tweets : []
  if (tweets.length === 0) {
    console.log('[x/post] No tweets in body')
    return NextResponse.json({ error: 'No tweets' }, { status: 400 })
  }

  const accessToken = await getValidXAccessToken(userId)
  if (!accessToken) {
    console.log('[x/post] No valid X access token')
    return NextResponse.json({ error: 'Connect X account first' }, { status: 400 })
  }

  console.log('[x/post] All checks passed, calling postThreadToX with', tweets.length, 'tweets')

  try {
    const postIds = await postThreadToX(accessToken, tweets)
    await incrementPostedCount(userId, 1)
    console.log('[x/post] SUCCESS - posted', postIds.length, 'tweets')
    return NextResponse.json({ success: true, postIds })
  } catch (err: any) {
    console.error('[x/post] Failed:', err)
    return NextResponse.json({ error: 'Failed to post to X' }, { status: 500 })
  }
}
