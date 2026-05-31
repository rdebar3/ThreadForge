'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

interface GrantResult {
  userId: string
  trialEndsAt: string
}

interface UsageStats {
  totalUsers: number
  usersWithGenerations: number
  totalGenerations: number
  topUsers: Array<{
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    totalGenerations: number
    lastGeneratedAt?: string
  }>
  error?: string
}

export default function AdminPage() {
  const { isSignedIn } = useUser()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [recentGrants, setRecentGrants] = useState<GrantResult[]>([])
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Fetch usage stats on load
  useEffect(() => {
    if (isSignedIn) {
      fetchStats()
    }
  }, [isSignedIn])

  const fetchStats = async () => {
    try {
      setStatsLoading(true)
      const res = await fetch('/api/admin/stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats', error)
    } finally {
      setStatsLoading(false)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <p>Please sign in to access the admin panel.</p>
      </div>
    )
  }

  const handleGrantAccess = async () => {
    if (!input.trim()) {
      alert('Please enter a Clerk User ID or email')
      return
    }

    setLoading(true)
    setMessage('')

    const isEmail = input.includes('@')
    const body = isEmail 
      ? { email: input.trim() } 
      : { targetUserId: input.trim() }

    try {
      const res = await fetch('/api/admin/grant-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (res.ok) {
        const newGrant: GrantResult = {
          userId: data.userId,
          trialEndsAt: data.trialEndsAt,
        }
        
        setMessage(`✅ Success! 7-day trial granted. Expires: ${new Date(data.trialEndsAt).toLocaleString()}`)
        setInput('')
        
        // Add to recent grants list (client-side only for now)
        setRecentGrants(prev => [newGrant, ...prev].slice(0, 10))
      } else {
        setMessage(`❌ Error: ${data.error || 'Something went wrong'}`)
      }
    } catch (error) {
      setMessage('❌ Failed to grant access. Check console.')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">ThreadForge Admin</h1>
        <p className="text-zinc-400 mb-8">Giveaway / 7-Day Trial Management</p>

        {/* Usage Stats */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Usage Analytics</h2>
            <button 
              onClick={fetchStats} 
              disabled={statsLoading}
              className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              {statsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {statsLoading ? (
            <p className="text-zinc-400">Loading stats...</p>
          ) : stats?.error ? (
            <p className="text-red-400">{stats.error}</p>
          ) : stats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-zinc-800 p-4 rounded-xl">
                  <div className="text-2xl font-bold">{stats.totalGenerations}</div>
                  <div className="text-xs text-zinc-400">Total Generations</div>
                </div>
                <div className="bg-zinc-800 p-4 rounded-xl">
                  <div className="text-2xl font-bold">{stats.usersWithGenerations}</div>
                  <div className="text-xs text-zinc-400">Active Users</div>
                </div>
                <div className="bg-zinc-800 p-4 rounded-xl">
                  <div className="text-2xl font-bold">{stats.totalUsers}</div>
                  <div className="text-xs text-zinc-400">Total Signed-up Users</div>
                </div>
              </div>

              {stats.topUsers.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2 text-sm text-zinc-400">Top Users by Generations</h3>
                  <div className="space-y-2">
                    {stats.topUsers.slice(0, 8).map((user, index) => (
                      <div key={index} className="bg-zinc-800 p-3 rounded-lg text-sm flex justify-between items-center">
                        <div>
                          <div className="font-medium">
                            {user.firstName || user.lastName 
                              ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                              : user.email}
                          </div>
                          <div className="text-[10px] text-zinc-500">{user.id}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{user.totalGenerations}</div>
                          <div className="text-[10px] text-zinc-500">generations</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-8">
          <label className="block text-sm text-zinc-400 mb-2">
            Clerk User ID <span className="text-zinc-500">(or email)</span>
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="user_xxxxxxxxxxxxxxx or user@example.com"
            className="w-full bg-zinc-800 border border-white/20 px-4 py-3 rounded-xl mb-4 text-white placeholder:text-zinc-500"
          />

          <button
            onClick={handleGrantAccess}
            disabled={loading || !input}
            className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Granting 7-day access...' : 'Grant 7 Days Free Access'}
          </button>

          {message && (
            <div className="mt-4 p-4 bg-zinc-800 rounded-xl text-sm">
              {message}
            </div>
          )}

          <div className="mt-6 text-xs text-zinc-500 space-y-1">
            <p>• Grants unlimited access for exactly 7 days from the moment of approval.</p>
            <p>• After 7 days the user returns to the free tier (3 generations).</p>
            <p>• You can enter either a Clerk User ID or the user’s email address.</p>
          </div>
        </div>

        {/* Recent Grants (client-side only) */}
        {recentGrants.length > 0 && (
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6">
            <h3 className="font-semibold mb-4 text-lg">Recent Grants (this session)</h3>
            <div className="space-y-3">
              {recentGrants.map((grant, index) => (
                <div key={index} className="bg-zinc-800 p-4 rounded-xl text-sm">
                  <div><span className="text-zinc-400">User ID:</span> {grant.userId}</div>
                  <div><span className="text-zinc-400">Expires:</span> {new Date(grant.trialEndsAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-3">Note: This list is only stored in your browser for this session.</p>
          </div>
        )}
      </div>
    </div>
  )
}
