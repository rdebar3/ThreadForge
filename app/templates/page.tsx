'use client'

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import Link from 'next/link'
import type { Template } from '../lib/types'

const READY_MADE: Template[] = [
  { id: 'lib1', title: 'Product Launch — Contrarian', category: 'Launch', tweets: ['Most launches fail for one simple reason.', 'It\'s not the product.', 'It\'s the story.'], savedAt: '' },
  { id: 'lib2', title: 'Personal Story Framework', category: 'Story', tweets: ['I used to believe X.', 'Then everything changed when...', 'Here\'s what I learned the hard way.'], savedAt: '' },
  { id: 'lib3', title: 'Hot Take on AI', category: 'Opinion', tweets: ['Hot take: AI won\'t replace you.', 'The people who win will be the ones who...', 'The real moat is...'], savedAt: '' },
  { id: 'lib4', title: 'Mistake + Lesson', category: 'Growth', tweets: ['Biggest mistake I made in 2025:', 'I optimized for the wrong metric.', 'Here\'s the uncomfortable truth...'], savedAt: '' },
  { id: 'lib5', title: 'Founder Advice Thread', category: 'Advice', tweets: ['If you\'re raising in 2026, read this.', 'Investors care less about your deck.', 'They care about...'], savedAt: '' },
  { id: 'lib6', title: 'Viral Thread Pattern', category: 'Growth', tweets: ['The threads that go viral have 3 things in common.', '1. A brutal hook.', '2. Specific proof.', '3. A payoff that makes people share.'], savedAt: '' },
]

export default function TemplatesPage() {
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()

  const legacyHasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const userPlan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacyHasPro ? 'pro-plus' : null)
  const hasPro = userPlan === 'pro' || userPlan === 'pro-plus'
  const isProPlus = userPlan === 'pro-plus'

  const [myTemplates, setMyTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{message:string; type:'success'|'error'|'info'}|null>(null)

  useEffect(() => {
    if (isSignedIn && hasPro) {
      loadMyTemplates()
    }
  }, [isSignedIn, hasPro])

  function showToast(m: string, t: 'success'|'error'|'info'='info') {
    setToast({ message: m, type: t })
    setTimeout(() => setToast(null), 3200)
  }

  async function loadMyTemplates() {
    setLoading(true)
    try {
      const r = await fetch('/api/templates')
      const d = await r.json()
      setMyTemplates(d.templates || [])
    } catch {}
    setLoading(false)
  }

  async function saveAsTemplate(tpl: {title: string, tweets: string[]}) {
    if (!hasPro) {
      showToast('Pro required to save private templates.', 'info')
      return
    }
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ title: tpl.title, tweets: tpl.tweets, category: 'Saved' })
      })
      if (res.ok) {
        showToast('Saved to your templates!', 'success')
        await loadMyTemplates()
      } else {
        const e = await res.json()
        showToast(e.error || 'Failed to save template', 'error')
      }
    } catch {
      showToast('Save failed', 'error')
    }
  }

  async function deleteTpl(id: string) {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast('Template deleted', 'info')
      await loadMyTemplates()
    }
  }

  function useTemplate(tpl: Template) {
    // Cross-page handoff via localStorage (simple, no backend needed)
    try {
      localStorage.setItem('threadforge_pending_template', JSON.stringify({
        title: tpl.title,
        tweets: tpl.tweets,
      }))
    } catch {}
    showToast('Template ready — heading to generator', 'success')
    setTimeout(() => {
      window.location.href = '/'
    }, 650)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tighter text-xl">ThreadForge</Link>
          <div className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Generator</Link>
            <Link href="/scheduler" className="text-zinc-400 hover:text-white">Scheduler</Link>
            <Link href="/history" className="text-zinc-400 hover:text-white">History</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-semibold tracking-tighter mb-2">Templates &amp; Prompt Library</h1>
        <p className="text-zinc-400 mb-8">Ready-to-use structures + your private saved threads. One click to load into the generator.</p>

        {/* Ready made library */}
        <div className="mb-10">
          <div className="uppercase text-xs tracking-[2px] text-violet-400 mb-3">READY-MADE STARTERS</div>
          <div className="grid md:grid-cols-2 gap-4">
            {READY_MADE.map((tpl, i) => (
              <div key={i} className="glass-card rounded-2xl border border-white/10 p-5">
                <div className="flex justify-between">
                  <div>
                    <div className="font-semibold">{tpl.title}</div>
                    <div className="text-xs text-zinc-500">{tpl.category}</div>
                  </div>
                  <button onClick={() => useTemplate(tpl)} className="text-sm px-4 py-1.5 rounded-2xl bg-white/5 hover:bg-violet-500 hover:text-white border border-white/10">Use Template</button>
                </div>
                <div className="mt-3 text-sm text-zinc-300 space-y-1">
                  {tpl.tweets.map((tw, idx) => <div key={idx} className="line-clamp-1">• {tw}</div>)}
                </div>
                {hasPro && (
                  <button onClick={() => saveAsTemplate({title: tpl.title, tweets: tpl.tweets})} className="mt-3 text-xs text-violet-400 hover:text-violet-300">+ Save to my templates</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* My saved (Pro) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="uppercase text-xs tracking-[2px] text-violet-400">MY SAVED TEMPLATES {hasPro ? '' : '(Pro)'}</div>
            {hasPro && <button onClick={loadMyTemplates} className="text-xs border border-white/10 px-3 py-1 rounded-full">Refresh</button>}
          </div>

          {!hasPro && (
            <div className="text-sm text-zinc-400 mb-4">Sign up for Pro to save your own threads as reusable private templates.</div>
          )}

          {hasPro && myTemplates.length === 0 && !loading && (
            <div className="text-sm text-zinc-500">No saved templates yet. Generate a thread and click “Save as Template” on the results.</div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {myTemplates.map((tpl) => (
              <div key={tpl.id} className="glass-card rounded-2xl border border-white/10 p-4">
                <div className="font-medium">{tpl.title}</div>
                <div className="text-[10px] text-zinc-500 mb-2">{tpl.category || 'Custom'} • {new Date(tpl.savedAt).toLocaleDateString()}</div>
                <div className="text-xs text-zinc-400 mb-3 line-clamp-2">{tpl.tweets[0]}</div>
                <div className="flex gap-2">
                  <button onClick={() => useTemplate(tpl)} className="text-sm px-4 py-1.5 rounded-2xl bg-violet-500 text-white">Use in Generator</button>
                  <button onClick={() => deleteTpl(tpl.id)} className="text-sm px-3 py-1.5 rounded-2xl border border-white/10">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 border border-white/10 px-5 py-2 rounded-2xl text-sm">{toast.message}</div>}
    </div>
  )
}
