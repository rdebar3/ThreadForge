import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

// Very basic in-memory rate limiting for the admin endpoint
const grantAttempts = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_GRANTS_PER_WINDOW = 10

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const attempts = grantAttempts.get(userId) || []
  const recentAttempts = attempts.filter(time => now - time < RATE_LIMIT_WINDOW)
  
  grantAttempts.set(userId, recentAttempts)
  
  return recentAttempts.length >= MAX_GRANTS_PER_WINDOW
}

function recordGrantAttempt(userId: string) {
  const attempts = grantAttempts.get(userId) || []
  attempts.push(Date.now())
  grantAttempts.set(userId, attempts)
}

/**
 * Admin-only endpoint to grant 7-day trial access.
 * Only the owner (hardcoded for now) can use this.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()

  // Only allow the owner to grant trials
  const OWNER_USER_ID = process.env.THREADFORGE_OWNER_ID || ''

  if (!userId || userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isRateLimited(userId)) {
    return NextResponse.json({ error: 'Too many grant attempts. Please wait.' }, { status: 429 })
  }

  recordGrantAttempt(userId)

  try {
    const body = await req.json()
    const { targetUserId, email } = body

    const client = await clerkClient()
    let finalUserId = targetUserId

    // Support lookup by email
    if (!targetUserId && email) {
      const users = await client.users.getUserList({
        emailAddress: [email],
        limit: 1,
      })
      if (users.data.length === 0) {
        return NextResponse.json({ error: 'No user found with that email' }, { status: 404 })
      }
      finalUserId = users.data[0].id
    }

    if (!finalUserId) {
      return NextResponse.json({ error: 'targetUserId or email is required' }, { status: 400 })
    }

    // Set hasPaid + trialEndsAt (7 days from now)
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    await client.users.updateUserMetadata(finalUserId, {
      publicMetadata: {
        hasPaid: true,
        trialEndsAt,
        grantedVia: 'giveaway',
        grantedAt: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `7-day trial granted to ${finalUserId}`,
      trialEndsAt,
      userId: finalUserId,
    })
  } catch (error) {
    console.error('Error granting trial:', error)
    return NextResponse.json({ error: 'Failed to grant trial' }, { status: 500 })
  }
}
