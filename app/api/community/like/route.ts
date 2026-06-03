import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { toggleShowcaseLike } from '../../../lib/clerk'

/**
 * POST /api/community/like
 * Toggle like/unlike for a showcase post.
 * Body: { postId: string }
 * Returns updated { likes, likedByMe }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Sign in to like posts' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const postId = typeof body?.postId === 'string' ? body.postId : null
  if (!postId) {
    return NextResponse.json({ error: 'postId required' }, { status: 400 })
  }

  const result = await toggleShowcaseLike(userId, postId)
  if (!result) {
    return NextResponse.json({ error: 'Post not found or update failed' }, { status: 404 })
  }

  return NextResponse.json({ success: true, ...result })
}
