import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

/**
 * Allows logged-in users to increment their free generation count in Clerk metadata.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { freeGenerationsUsed } = await req.json()

    const client = await clerkClient()
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        freeGenerationsUsed: Math.max(0, freeGenerationsUsed),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to track generation:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
