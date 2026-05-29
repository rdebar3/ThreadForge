import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

/**
 * Temporary testing route.
 * Resets the current signed-in user's free tier + paid status.
 * Only use during local development/testing.
 */
export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  try {
    const client = await clerkClient()

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        hasPaid: false,
        freeGenerationsUsed: 3,
      },
    })

    return NextResponse.json({ 
      success: true, 
      message: "Account reset. You now have 0 generations left and are not marked as paid." 
    })
  } catch (error) {
    console.error('Failed to reset account:', error)
    return NextResponse.json({ error: 'Failed to reset account' }, { status: 500 })
  }
}
