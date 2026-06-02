import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { disconnectXAccount } from '../../../lib/clerk'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await disconnectXAccount(userId)
  return NextResponse.json({ success: true })
}
