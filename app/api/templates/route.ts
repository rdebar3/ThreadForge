import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isPro, getUserTemplates, saveUserTemplate, deleteUserTemplate } from '../../lib/clerk'
import type { Template } from '../../lib/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ templates: [] })

  const templates = await getUserTemplates(userId)
  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const pro = await isPro(userId)
  if (!pro) return NextResponse.json({ error: 'Pro required to save templates' }, { status: 403 })

  const body = await req.json()
  const { title, tweets, category } = body

  if (!title || !Array.isArray(tweets) || tweets.length === 0) {
    return NextResponse.json({ error: 'title and tweets required' }, { status: 400 })
  }

  const saved = await saveUserTemplate(userId, {
    title: String(title).slice(0, 100),
    tweets: tweets.map((t: string) => String(t).slice(0, 280)),
    category: category || 'Custom',
  })

  if (!saved) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ success: true, template: saved })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const ok = await deleteUserTemplate(userId, id)
  return NextResponse.json({ success: ok })
}
