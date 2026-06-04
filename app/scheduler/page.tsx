'use client'

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import Link from 'next/link'
import type { ScheduledPost } from '../lib/types'

interface Toast {
  message: string
  type: 'success' | 'error' | 'info'
}

export default function SchedulerPage() {
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()

  // Plan detection (same pattern as homepage/history)
  const legacyHasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const userPlan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacyHasPro ? 'pro-plus' : null)
  const hasPro = userPlan === 'pro' || userPlan === 'pro-plus'
  const isProPlus = userPlan === 'pro-plus'
  const hasUsedProPlusTrial = !!(user?.publicMetadata?.hasUsedProPlusTrial)

  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [xAccount, setXAccount] = useState<{ username: string; xUserId?: string; connectedAt?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)

  // Form state for manual/custom schedule
  const [customTitle, setCustomTitle] = useState('')
  const [customTweetsText, setCustomTweetsText] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')

  const [isScheduling, setIsScheduling] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [xLoading, setXLoading] = useState(false)

  // Best time suggestions (client-side, local time)
  const bestTimeSuggestions = getBestTimeSuggestions()

  useEffect(() => {
    if (isSignedIn) {
      // Always handle redirect params (e.g. ?error=config or ?connected=1) so toasts show even for trial users
      handleConnectRedirect()
    }

    if (isSignedIn && (isProPlus || !hasUsedProPlusTrial)) {
      fetchSchedules()
      fetchXAccount()
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isProPlus, hasUsedProPlusTrial])

  function showToast(message: string, type: Toast['type'] = 'info') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4200)
  }

  async function fetchSchedules() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/schedules')
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 || res.status === 403) {
          setError('Pro+ subscription required for Thread Scheduler.')
        } else {
          setError(data.error || 'We couldn’t complete that action right now. Your work is safe in History.')
        }
        return
      }
      setScheduledPosts(data.scheduledPosts || [])
      // X account status is not returned by schedules; we can infer from any posted or keep separate.
      // For simplicity we optimistically clear on disconnect and set after connect via query.
    } catch (e) {
      setError('We couldn’t complete that action right now. Your work is safe in History.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchXAccount() {
    setXLoading(true)
    try {
      const res = await fetch('/api/x/account')
      if (res.ok) {
        const data = await res.json()
        setXAccount(data.account || null)
      }
    } catch (e) {
      // non-fatal, just won't show connected state
      console.warn('Failed to fetch X account status')
    } finally {
      setXLoading(false)
    }
  }

  function handleConnectRedirect() {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      showToast('X account connected successfully! You can now schedule posts.', 'success')
      // Clean URL
      window.history.replaceState({}, '', '/scheduler')
      // Re-fetch schedules and X account to show connected username
      setTimeout(() => {
        fetchSchedules()
        fetchXAccount()
      }, 600)
    }
    const err = params.get('error')
    if (err) {
      const friendly = err === 'config'
        ? 'X connection issue. Reconnect your account from Scheduler.'
        : err === 'invalid_state'
        ? 'Something went wrong. Please try again in a moment.'
        : 'We couldn’t complete that action right now. Your work is safe in History.'
      showToast(friendly, 'error')
      window.history.replaceState({}, '', '/scheduler')
    }
  }

  async function connectX() {
    if (!isProPlus && hasUsedProPlusTrial) {
      showToast('Scheduler requires Pro+. You have used your one-time trial.', 'info')
      return
    }
    setIsConnecting(true)
    // This will redirect the browser to X
    // Trigger the correct OAuth flow under /api/auth/x/connect to match registered callback https://threadforge.space/api/auth/callback/x
    window.location.href = '/api/auth/x/connect'
  }

  async function disconnectX() {
    try {
      const res = await fetch('/api/x/disconnect', { method: 'POST' })
      if (res.ok) {
        setXAccount(null)
        showToast('X account disconnected.', 'info')
      } else {
        showToast('We couldn’t complete that action right now. Your work is safe in History.', 'error')
      }
    } catch {
      showToast('We couldn’t complete that action right now. Your work is safe in History.', 'error')
    }
  }

  function getBestTimeSuggestions() {
    const suggestions: { label: string; value: string }[] = []
    const now = new Date()

    // In ~30 minutes
    const soon = new Date(now.getTime() + 30 * 60 * 1000)
    suggestions.push({ label: 'In 30 min', value: soon.toISOString().slice(0, 16) })

    // Common high-engagement windows (next occurrence in local time)
    const preferredHours = [9, 12, 17, 20]
    for (const hour of preferredHours) {
      const d = new Date(now)
      d.setHours(hour, Math.floor(Math.random() * 20), 0, 0)
      if (d.getTime() <= now.getTime() + 5 * 60 * 1000) {
        d.setDate(d.getDate() + 1)
      }
      suggestions.push({
        label: `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${hour}:00`,
        value: d.toISOString().slice(0, 16),
      })
    }
    return suggestions.slice(0, 6)
  }

  function applySuggestion(value: string) {
    setScheduleTime(value)
    showToast('Best time selected. Adjust if needed.', 'info')
  }

  async function scheduleCustom() {
    if (!isProPlus && hasUsedProPlusTrial) {
      showToast('You have used your one-time Pro+ trial. Subscribe to Pro+ on the homepage to unlock permanently.', 'info')
      return
    }
    if (!scheduleTime) {
      showToast('Please pick a date & time to schedule.', 'error')
      return
    }
    if (!xAccount) {
      showToast('Please connect your X account first to schedule posts.', 'info')
      return
    }

    const lines = customTweetsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) {
      showToast('Enter at least one tweet (one per line).', 'error')
      return
    }

    setIsScheduling(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim() || undefined,
          tweets: lines,
          scheduledFor: new Date(scheduleTime).toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requireUpgrade) {
          showToast('Subscribe to Pro+ on the homepage to use the scheduler.', 'info')
        } else {
          showToast(data.error || 'We couldn’t complete that action right now. Your work is safe in History.', 'error')
        }
        return
      }
      showToast('Thread scheduled successfully!', 'success')
      if (data.wasTrial) {
        showToast('Pro+ Trial used! This was your one free use of Scheduler.', 'info')
      }
      setCustomTitle('')
      setCustomTweetsText('')
      // keep the time or clear
      await fetchSchedules()
    } catch (e) {
      showToast('We couldn’t complete that action right now. Your work is safe in History.', 'error')
    } finally {
      setIsScheduling(false)
    }
  }

  async function cancelSchedule(id: string) {
    if (!confirm('Cancel this scheduled post?')) return
    try {
      const res = await fetch(`/api/schedules?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Schedule canceled.', 'info')
        await fetchSchedules()
      } else {
        showToast('We couldn’t complete that action right now. Your work is safe in History.', 'error')
      }
    } catch {
      showToast('Cancel request failed.', 'error')
    }
  }

  // Split lists
  const pending = scheduledPosts.filter((p) => p.status === 'pending')
  const history = scheduledPosts.filter((p) => p.status !== 'pending')

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center glass-card border border-white/10 rounded-3xl p-10">
          <h1 className="text-3xl font-semibold tracking-tighter mb-4">Thread Scheduler</h1>
          <p className="text-zinc-400 mb-8">Sign in to use Thread Scheduler with Pro+ (one-time trial available for eligible users).</p>
          <button
            onClick={() => openSignIn()}
            className="px-8 py-3 rounded-2xl bg-white text-zinc-950 font-semibold hover:bg-zinc-200 transition"
          >
            Sign in to continue
          </button>
          <div className="mt-6">
            <Link href="/" className="text-sm text-violet-400 hover:text-violet-300">← Back to generator</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!isProPlus && hasUsedProPlusTrial) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="max-w-3xl mx-auto px-6 pt-16 pb-24">
          <div className="flex items-center gap-3 mb-8">
            <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Home</Link>
            <span className="text-zinc-700">/</span>
            <span className="font-medium">Scheduler</span>
          </div>

          <div className="glass-card rounded-3xl border border-white/10 p-10 text-center">
            <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-4xl">📅</div>
            <h1 className="text-4xl font-semibold tracking-tighter mb-3">Thread Scheduler is Pro+ only</h1>
            <p className="text-zinc-400 max-w-md mx-auto mb-8">
              You have used your one-time Pro+ trial. Subscribe to Pro+ on the homepage to unlock Scheduler + AI Images permanently.
            </p>
            <div className="mt-4 text-xs text-zinc-500">Includes AI Images + Scheduler + everything in Pro</div>
            <Link href="/" className="mt-6 inline-block text-sm text-violet-400 hover:text-violet-300">← Back to homepage</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {/* Top nav */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tighter text-xl">ThreadForge</Link>
            <span className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">PRO+</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Generator</Link>
            <Link href="/history" className="text-zinc-400 hover:text-white">History</Link>
            <span className="text-white">Scheduler</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="uppercase tracking-[2px] text-[10px] text-violet-400 mb-1">PRO+</div>
            <h1 className="text-4xl font-semibold tracking-tighter">Thread Scheduler</h1>
            <p className="text-zinc-400 mt-1">Schedule threads to post automatically to X (Pro+ only, one-time trial available). Connect once, pick the time, we post it.</p>
          </div>
          <Link href="/" className="text-sm px-4 py-2 border border-white/10 hover:bg-white/5 rounded-2xl">← Back to generator</Link>
        </div>

        {/* X Connection Card */}
        <div id="x-connect" className="glass-card rounded-3xl border border-white/10 p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <div className="font-semibold mb-1">X Account Connection</div>
              <div className="text-sm text-zinc-400">
                {xLoading ? 'Checking X connection…' : xAccount ? `Connected as @${xAccount.username}` : 'Connect your X account to enable automatic posting (Pro+ or one-time trial).'}
              </div>
            </div>
            <div className="flex gap-3">
              {!xAccount ? (
                <button
                  onClick={connectX}
                  disabled={isConnecting}
                  className="px-6 py-2.5 rounded-2xl bg-white text-zinc-950 font-semibold hover:bg-zinc-100 disabled:opacity-50 flex items-center gap-2"
                >
                  {isConnecting ? 'Connecting…' : 'Connect X Account'}
                </button>
              ) : (
                <>
                  <div className="px-4 py-2 text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center">
                    ✓ Connected
                  </div>
                  <button
                    onClick={disconnectX}
                    className="px-5 py-2.5 rounded-2xl border border-white/10 hover:bg-zinc-900 text-sm"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">
            We only request the permissions needed to post threads on your behalf (tweet.write). You can revoke anytime from X settings.
          </div>
          <div className="mt-1 text-[10px] text-amber-400/80">Clicking Connect will redirect you to X.com for secure OAuth2 authorization.</div>
        </div>

        {/* Best time suggestions - dynamic and premium */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[1.5px] text-violet-400 mb-2 flex items-center gap-2">
            BEST TIME TO POST SUGGESTIONS <span className="text-[10px] normal-case text-zinc-500">(based on typical X engagement)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {bestTimeSuggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => applySuggestion(sug.value)}
                className="text-sm px-4 py-2 rounded-2xl border border-white/10 hover:border-violet-400/50 hover:bg-violet-500/5 hover:text-violet-200 transition active:scale-[0.985] flex items-center gap-1.5"
              >
                <span>🕒</span> {sug.label}
              </button>
            ))}
            <button
              onClick={() => {
                const d = new Date(Date.now() + 2 * 60 * 60 * 1000)
                setScheduleTime(d.toISOString().slice(0, 16))
              }}
              className="text-sm px-4 py-2 rounded-2xl border border-white/10 hover:border-violet-400/50 hover:bg-violet-500/5 hover:text-violet-200 transition active:scale-[0.985] flex items-center gap-1.5"
            >
              <span>⏱️</span> +2 hours
            </button>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1.5">Times are in your local timezone. Actual performance varies.</div>
        </div>

        {/* Manual / Custom Schedule Form */}
        <div id="custom-schedule" className="glass-card rounded-3xl border border-white/10 p-6 mb-10">
          <div className="font-semibold tracking-tight mb-4 text-lg">Quick custom schedule</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Title (optional)</label>
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Launch announcement thread"
                className="w-full bg-zinc-900 border border-white/10 focus:border-violet-500/50 rounded-2xl px-4 py-3 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Schedule for (local time)</label>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                min={new Date(Date.now() - 1000 * 60 * 5).toISOString().slice(0, 16)}
                className="w-full bg-zinc-900 border border-white/10 focus:border-violet-500/50 rounded-2xl px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-zinc-400 block mb-1.5">Tweets (one per line)</label>
            <textarea
              value={customTweetsText}
              onChange={(e) => setCustomTweetsText(e.target.value)}
              rows={5}
              placeholder={`First tweet here...\nSecond tweet continues the story...\nPowerful closer.`}
              className="w-full bg-zinc-900 border border-white/10 focus:border-violet-500/50 rounded-2xl px-4 py-3 text-sm font-mono outline-none resize-y"
            />
            <div className="text-[10px] text-zinc-500 mt-1">Each line becomes one tweet. Max ~280 chars per tweet enforced on post.</div>
          </div>

          <button
            onClick={scheduleCustom}
            disabled={isScheduling || !scheduleTime || !customTweetsText.trim() || !xAccount}
            className="mt-4 w-full md:w-auto px-8 py-3 rounded-2xl bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-700 disabled:text-zinc-400 text-white font-semibold transition flex items-center justify-center gap-2"
          >
            {isScheduling ? 'Scheduling…' : 'Schedule this thread'}
          </button>
          <div className="text-xs text-zinc-500 mt-2">Pro+ only (one-time trial available for non-Pro+). We will post the full thread as a reply chain at the exact time.</div>
        </div>

        {/* Queue */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold tracking-tight">Upcoming ({pending.length})</div>
            <button onClick={fetchSchedules} className="text-xs px-3 py-1 border border-white/10 rounded-full hover:bg-white/5">Refresh</button>
          </div>

          {loading ? (
            <div className="glass-card rounded-2xl border border-white/10 p-8 text-center">
              <div className="animate-pulse text-sm text-zinc-400">Loading your scheduled posts…</div>
            </div>
          ) : pending.length === 0 ? (
            <div className="glass-card rounded-2xl border border-white/10 p-8 text-center">
              <div className="text-lg mb-2">📭 No upcoming posts</div>
              <p className="text-sm text-zinc-400 mb-4">
                Schedule your first thread to see it here. Connect your X account above or use the form below to create your first scheduled post.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button 
                  onClick={() => document.getElementById('x-connect')?.scrollIntoView({ behavior: 'smooth' })} 
                  className="text-sm px-6 py-2.5 rounded-2xl bg-white text-zinc-950 font-semibold hover:bg-zinc-100"
                >
                  Connect X Account
                </button>
                <button 
                  onClick={() => document.getElementById('custom-schedule')?.scrollIntoView({ behavior: 'smooth' })} 
                  className="text-sm px-4 py-2 rounded-2xl border border-white/10 hover:bg-zinc-900"
                >
                  Create First Scheduled Post
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((post) => (
                <div key={post.id} className="glass-card rounded-2xl border border-white/10 p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-[15px]">{post.title || 'Untitled thread'}</div>
                      <div className="text-xs text-emerald-400 mt-0.5">
                        Scheduled for {new Date(post.scheduledFor).toLocaleString()}
                      </div>
                      <div className="mt-3 text-sm text-zinc-300 line-clamp-2">
                        {post.tweets[0]}
                        {post.tweets.length > 1 && <span className="text-zinc-500"> + {post.tweets.length - 1} more</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => cancelSchedule(post.id)}
                      className="text-xs px-4 py-2 rounded-xl border border-white/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] text-zinc-500">{post.tweets.length} tweets • created {new Date(post.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* History / Past activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold tracking-tight">Past activity ({history.length})</div>
          </div>
          {history.length === 0 ? (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-center">
              <div className="text-lg mb-1">📜 No past activity yet</div>
              <p className="text-sm text-zinc-400">
                Once you schedule and posts go live (or you cancel), they'll appear here with status and links to X.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.slice(0, 12).map((post) => {
                const isPosted = post.status === 'posted'
                const link = isPosted && post.xPostIds?.[0]
                  ? `https://x.com/i/web/status/${post.xPostIds[0]}`
                  : null
                return (
                  <div key={post.id} className="glass-card rounded-2xl border border-white/10 p-4 text-sm flex items-center justify-between gap-4">
                    <div className="min-w-0 truncate">
                      {post.title || post.tweets[0]?.slice(0, 70)}…
                      <span className="ml-2 text-[10px] text-zinc-500">{new Date(post.scheduledFor).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2 py-px rounded ${isPosted ? 'bg-emerald-500/10 text-emerald-400' : post.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-700 text-zinc-400'}`}>
                        {post.status}
                      </span>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 text-xs">
                          View on X →
                        </a>
                      )}
                      {post.error && <span className="text-[10px] text-red-400 max-w-[160px] truncate" title={post.error}>err</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-12 text-center text-xs text-zinc-500 max-w-md mx-auto">
          <strong>Disclaimer:</strong> Scheduled posts are attempted within ~5 minutes of the selected time using our secure background job (Vercel Cron). 
          Success depends on your X connection remaining valid, rate limits, and X API availability. 
          We recommend testing with the manual "Post to X" first. You can cancel anytime before the scheduled time.
        </div>
      </div>

      {/* Toast - consistent reusable error/success display */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-2xl text-sm shadow-xl border flex items-center gap-2 max-w-[90vw] ${
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/40 text-red-300' :
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' :
          'bg-zinc-900 border-zinc-700 text-zinc-200'
        }`}>
          <span>
            {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : 'ℹ️'}
          </span>
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-xs opacity-70 hover:opacity-100">×</button>
        </div>
      )}
    </div>
  )
}
