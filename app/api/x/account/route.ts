import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getXAccount } from '../../../lib/clerk'
import type { XAccount } from '../../../lib/types'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const account = await getXAccount(userId)
  if (!account) {
    return NextResponse.json({ account: null })
  }

  // Return only safe public fields, never tokens
  const safeAccount = {
    username: account.username,
    xUserId: account.xUserId,
    connectedAt: account.connectedAt,
  }

  return NextResponse.json({ account: safeAccount })
}
