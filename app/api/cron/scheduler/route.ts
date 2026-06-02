import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import {
  getValidXAccessToken,
  getScheduledPosts,
  filterDuePending,
  updateScheduledPost,
  isProPlus,
} from '../../../lib/clerk'
import type { ScheduledPost } from '../../../lib/types'

const X_TWEETS_URL = 'https://api.x.com/2/tweets'

/**
 * Posts a thread (or single tweet) as a reply chain on X.
 * Returns array of created tweet IDs.
 */
async function postThreadToX(accessToken: string, tweets: string[]): Promise<string[]> {
  const postedIds: string[] = []
  let inReplyTo: string | null = null

  for (const raw of tweets) {
    const text = (raw || '').trim().slice(0, 280)
    if (!text) continue

    const payload: any = { text }
    if (inReplyTo) {
      payload.reply = { in_reply_to_tweet_id: inReplyTo }
    }

    const res = await fetch(X_TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`X API error ${res.status}: ${errText.substring(0, 180)}`)
    }

    const json = await res.json()
    const id = json?.data?.id
    if (!id) throw new Error('X returned no tweet id')

    postedIds.push(id)
    inReplyTo = id
  }

  if (postedIds.length === 0) {
    throw new Error('No tweets were posted')
  }

  return postedIds
}

/**
 * Vercel Cron (or manual trigger) endpoint for publishing due scheduled posts.
 * 
 * Protection:
 * - In production: requires x-vercel-cron: 1 header OR Authorization: Bearer $CRON_SECRET
 * - Set CRON_SECRET in env for manual/testing triggers.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization') || ''
  const vercelCronHeader = req.headers.get('x-vercel-cron')

  const isAuthorized =
    vercelCronHeader === '1' ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (process.env.NODE_ENV !== 'production' && !cronSecret) // dev convenience if no secret

  if (!isAuthorized) {
    console.warn('[cron/scheduler] Unauthorized cron attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/scheduler] Run started at', new Date().toISOString())

  const client = await clerkClient()
  let users: any[] = []

  try {
    // Fetch up to ~200 users. For larger scale move schedules to a real queue/DB.
    const res1 = await client.users.getUserList({ limit: 100 })
    users = res1.data || []
    if ((res1.totalCount || 0) > 100) {
      const res2 = await client.users.getUserList({ limit: 100, offset: 100 })
      users = users.concat(res2.data || [])
    }
  } catch (e) {
    console.error('[cron/scheduler] Failed to list users', e)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }

  let dueProcessed = 0
  let successfullyPosted = 0

  for (const user of users) {
    const userId = user.id
    try {
      const posts: ScheduledPost[] = (user.publicMetadata?.scheduledPosts as ScheduledPost[]) || []
      const due = filterDuePending(posts)
      if (due.length === 0) continue

      // Re-check plan is still Pro+ (safety)
      const stillProPlus = await isProPlus(userId)
      if (!stillProPlus) {
        // Mark them failed/canceled? For now leave pending (user downgraded)
        continue
      }

      const accessToken = await getValidXAccessToken(userId)
      if (!accessToken) {
        for (const p of due) {
          await updateScheduledPost(userId, p.id, {
            status: 'failed',
            error: 'X account not connected or token invalid',
          })
        }
        continue
      }

      for (const sched of due) {
        dueProcessed++
        try {
          const xPostIds = await postThreadToX(accessToken, sched.tweets)
          await updateScheduledPost(userId, sched.id, {
            status: 'posted',
            postedAt: new Date().toISOString(),
            xPostIds,
          })
          successfullyPosted++
          console.log(`[cron/scheduler] ✅ Posted ${sched.id} (${sched.tweets.length} tweets) for user ${userId}`)
        } catch (postErr: any) {
          console.error(`[cron/scheduler] ❌ Post failed for ${sched.id}:`, postErr?.message)
          await updateScheduledPost(userId, sched.id, {
            status: 'failed',
            error: String(postErr?.message || 'Unknown X post error').slice(0, 240),
          })
        }
      }
    } catch (userErr) {
      console.error(`[cron/scheduler] Error processing user ${userId}`, userErr)
    }
  }

  const summary = { ok: true, dueProcessed, successfullyPosted, timestamp: new Date().toISOString() }
  console.log('[cron/scheduler] Completed', summary)
  return NextResponse.json(summary)
}
