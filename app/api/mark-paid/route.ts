import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

/**
 * Marks the currently logged-in user as paid.
 * Called from the success page after Stripe session verification.
 */
export async function POST() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const client = await clerkClient()
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        hasPaid: true,
        paidAt: new Date().toISOString(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to mark user as paid:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
