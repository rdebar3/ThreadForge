import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getValidXAccessToken, isPro, incrementPostedCount, postThreadToX } from '../../../lib/clerk'

export async function POST(req: NextRequest) {
  console.log('[x/post] API called')
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasPro = await isPro(userId)
  if (!hasPro) return NextResponse.json({ error: 'Pro required' }, { status: 402 })

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad body' }, { status: 400 })
  }

  const tweets = Array.isArray(body?.tweets) ? body.tweets : []
  if (tweets.length === 0) return NextResponse.json({ error: 'No tweets' }, { status: 400 })

  const accessToken = await getValidXAccessToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'Connect X account first' }, { status: 400 })

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
