'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'

export default function AnalyticsPage() {
  const { isSignedIn, user } = useUser()

  const legacy = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const plan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacy ? 'pro-plus' : null)
  const isProPlus = plan === 'pro-plus'
  const posted = (user?.publicMetadata?.postedCount as number) || 0
  const last = user?.publicMetadata?.lastPostedAt as string | undefined

  if (!isSignedIn || !isProPlus) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="glass-card max-w-md text-center p-10 border border-white/10 rounded-3xl">
          <h1 className="text-3xl font-semibold mb-3">Analytics (Pro+)</h1>
          <p className="text-zinc-400 mb-6">Insights, reach estimates, and best-time recommendations are available for Pro+ subscribers.</p>
          <a href="#pricing" className="inline-block px-8 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-2xl font-semibold">Upgrade to Pro+</a>
          <div className="mt-4"><Link href="/" className="text-sm text-violet-400">Back home</Link></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-sm text-zinc-400">← Home</Link>
          <span className="text-zinc-600">/</span>
          <span>Analytics</span>
        </div>

        <h1 className="text-4xl font-semibold tracking-tighter mb-1">Your X Insights</h1>
        <p className="text-zinc-400 mb-8">Basic performance tracking powered by your activity + smart recommendations.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card rounded-3xl p-6 border border-white/10">
            <div className="text-xs text-zinc-400">THREADS SENT TO X</div>
            <div className="text-5xl font-semibold tracking-tighter mt-2">{posted}</div>
            <div className="text-emerald-400 text-sm mt-1">Lifetime (tracked)</div>
          </div>
          <div className="glass-card rounded-3xl p-6 border border-white/10">
            <div className="text-xs text-zinc-400">AVG. IMPRESSIONS (EARLY)</div>
            <div className="text-2xl font-semibold tracking-tighter mt-2">100–800</div>
            <div className="text-xs mt-1 text-zinc-400">Per thread. Real reach grows with audience &amp; consistency. Building momentum.</div>
          </div>
          <div className="glass-card rounded-3xl p-6 border border-white/10">
            <div className="text-xs text-zinc-400">LAST POST</div>
            <div className="mt-2 text-lg">{last ? new Date(last).toLocaleDateString() : '—'}</div>
            <div className="mt-6 text-xs text-violet-400">Keep the streak going</div>
          </div>
        </div>

        {/* Best times */}
        <div className="glass-card rounded-3xl p-6 border border-white/10 mb-8">
          <div className="uppercase text-xs tracking-[1.5px] text-violet-400 mb-3">RECOMMENDED POST TIMES (BASED ON X DATA)</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {['9:00–10:00', '12:00–13:00', '17:00–18:30', '20:00–21:30'].map((t, i) => (
              <span key={i} className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10">{t}</span>
            ))}
          </div>
          <div className="text-xs text-zinc-500 mt-3">Best on Tue–Thu. Use the Scheduler for perfect timing.</div>
          <Link href="/scheduler" className="text-violet-400 text-sm mt-1 inline-block">Open Scheduler →</Link>
        </div>

        <div className="text-xs text-zinc-500">Analytics are intentionally lightweight (Clerk metadata). For real X analytics, connect your account in Scheduler and we’ll expand this over time.</div>
      </div>
    </div>
  )
}
