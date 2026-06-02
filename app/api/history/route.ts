import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getGenerationHistory } from '../../lib/clerk'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const hasPro = !!(user.publicMetadata?.hasPro || user.publicMetadata?.hasPaid)

    if (!hasPro) {
      return NextResponse.json({ error: 'Pro subscription required' }, { status: 403 })
    }

    const history = await getGenerationHistory(userId)

    // Sort most recent first (desc by timestamp)
    const sorted = [...history].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return NextResponse.json({ history: sorted })
  } catch (error) {
    console.error('Error fetching history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
