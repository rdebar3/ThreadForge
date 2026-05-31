import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUsageStats } from '../../lib/clerk'

/**
 * Admin stats endpoint.
 * Returns basic usage analytics from Clerk metadata.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth()

  const OWNER_USER_ID = process.env.THREADFORGE_OWNER_ID || ''

  if (!userId || userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await getUsageStats(100)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
