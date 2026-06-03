import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { submitShowcasePost, getCommunityShowcasePosts } from '../../lib/clerk'
import type { ShowcasePost } from '../../lib/types'

/**
 * GET /api/community
 * Returns public enriched showcase posts (newest first by default).
 * If signed in, includes likedByMe flags.
 */
export async function GET() {
  try {
    const { userId } = await auth()
    const posts = await getCommunityShowcasePosts(userId || null)
    return NextResponse.json({ posts, count: posts.length })
  } catch (err) {
    console.error('[community] GET failed', err)
    return NextResponse.json({ posts: [], count: 0, error: 'Failed to load showcase' }, { status: 200 })
  }
}

/**
 * POST /api/community
 * Submit current generated thread to public showcase.
 * Body: { title: string, tweets: string[], images?: any[] }
 * Requires auth. Returns the created post.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required to submit to showcase' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title : 'Untitled Thread'
  const tweets = Array.isArray(body?.tweets) ? body.tweets : []
  const images = Array.isArray(body?.images) ? body.images : undefined

  if (tweets.length === 0) {
    return NextResponse.json({ error: 'No tweets to submit' }, { status: 400 })
  }

  const created = await submitShowcasePost(userId, { title, tweets, images })
  if (!created) {
    return NextResponse.json({ error: 'Failed to save to showcase. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, post: created })
}
