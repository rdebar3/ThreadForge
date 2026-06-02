import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getScheduledPosts, addScheduledPost, removeScheduledPost, canUseProPlusFeature, markProPlusTrialUsed } from '../../lib/clerk'
import type { ScheduledPost } from '../../lib/types'

const MAX_TWEETS = 10
const MAX_TWEET_LENGTH = 280

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Allow Pro users to view (though creation is Pro+), but primarily for Pro+
  const posts = await getScheduledPosts(userId)
  // Return pending first, then recent others
  const sorted = [...posts].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime()
  })

  return NextResponse.json({ scheduledPosts: sorted })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const featureCheck = await canUseProPlusFeature(userId)
  if (!featureCheck.allowed) {
    return NextResponse.json({
      error: 'Thread Scheduler is a Pro+ feature. You have used your one-time trial.',
      requireUpgrade: true,
      upgradeTo: 'pro-plus'
    }, { status: 402 })
  }

  const isTrialUse = featureCheck.isTrial

  try {
    const body = await req.json()
    const { title, tweets, scheduledFor } = body as {
      title?: string
      tweets: string[]
      scheduledFor: string
    }

    if (!Array.isArray(tweets) || tweets.length === 0 || tweets.length > MAX_TWEETS) {
      return NextResponse.json({ error: `Provide 1-${MAX_TWEETS} tweets` }, { status: 400 })
    }

    const cleanTweets = tweets.map((t: string) => (t || '').trim().slice(0, MAX_TWEET_LENGTH)).filter(Boolean)
    if (cleanTweets.length === 0) {
      return NextResponse.json({ error: 'Tweets cannot be empty' }, { status: 400 })
    }

    if (!scheduledFor || isNaN(Date.parse(scheduledFor))) {
      return NextResponse.json({ error: 'Valid scheduledFor (ISO datetime) is required' }, { status: 400 })
    }

    const when = new Date(scheduledFor)
    const now = new Date()
    if (when.getTime() < now.getTime() - 60 * 1000) { // allow slight past for clock skew
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
    }

    const created = await addScheduledPost(userId, {
      title: (title || '').trim().slice(0, 120) || undefined,
      tweets: cleanTweets,
      scheduledFor: when.toISOString(),
      status: 'pending',
      createdAt: now.toISOString(),
    })

    if (!created) {
      return NextResponse.json({ error: 'Failed to save schedule' }, { status: 500 })
    }

    // Mark trial consumed on successful schedule
    if (isTrialUse) {
      await markProPlusTrialUsed(userId)
      console.log(`[schedules] Marked one-time Pro+ trial as used for ${userId}`)
    }

    return NextResponse.json({ success: true, scheduledPost: created, wasTrial: isTrialUse })
  } catch (e: any) {
    console.error('Schedule POST error:', e)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const ok = await removeScheduledPost(userId, id)
  if (!ok) {
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
