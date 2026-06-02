import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { incrementPostedCount, isProPlus } from '../../../lib/clerk'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ ok: true })
  const plus = await isProPlus(userId)
  if (plus) {
    await incrementPostedCount(userId, 1)
  }
  return NextResponse.json({ ok: true })
}
