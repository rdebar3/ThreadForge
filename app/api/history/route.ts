import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getGenerationHistory, isPro } from '../../lib/clerk'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const hasProAccess = await isPro(userId)

    if (!hasProAccess) {
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
