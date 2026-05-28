'use client'

import { useState, useEffect } from 'react'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

export default function ThreadForge() {
  const [topic, setTopic] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0)

  const MAX_FREE_GENERATIONS = 3

  // Load paid status and free generation count on mount
  useEffect(() => {
    const paid = checkPaidStatus()
    setIsPaid(paid)

    const used = getFreeGenerationsUsed()
    setFreeGenerationsUsed(used)
  }, [])

  // Check if user has paid (demo using localStorage)
  const checkPaidStatus = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('threadforge_paid') === 'true'
    }
    return false
  }

  // Load free generation count
  const getFreeGenerationsUsed = () => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('threadforge_free_generations') || '0')
    }
    return 0
  }



  const handleGenerate = async () => {
    if (!topic.trim()) return

    const paid = checkPaidStatus()
    setIsPaid(paid)

    const currentUsed = getFreeGenerationsUsed()

    if (!paid && currentUsed >= MAX_FREE_GENERATIONS) {
      setShowPaywall(true)
      return
    }

    setIsGenerating(true)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() })
      })

      const data = await res.json()
      setThreads(data.threads || [])

      if (data.note) {
        setDemoMode(true)
        console.log('[ThreadForge]', data.note)
      } else {
        setDemoMode(false)
      }

      // Track free generations
      if (!paid) {
        const newCount = currentUsed + 1
        localStorage.setItem('threadforge_free_generations', newCount.toString())
        setFreeGenerationsUsed(newCount)
      }
    } catch (error) {
      // Fallback to client generation if API fails
      const generated = generateThreads(topic.trim())
      setThreads(generated)

      if (!paid) {
        const newCount = currentUsed + 1
        localStorage.setItem('threadforge_free_generations', newCount.toString())
        setFreeGenerationsUsed(newCount)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const copyThread = (thread: Thread) => {
    const fullThread = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(fullThread)
    
    // Simple feedback
    const originalText = event?.currentTarget?.innerText || ''
    const button = event?.currentTarget as HTMLButtonElement
    if (button) {
      button.innerText = 'Copied!'
      setTimeout(() => {
        button.innerText = 'Copy Thread'
      }, 1500)
    }
  }

  const handlePayment = async () => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/generate`,
        }),
      })

      const data = await res.json()

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url
      } else {
        alert('Something went wrong. Please try again.')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <span className="text-zinc-950 font-bold text-xl tracking-tighter">TF</span>
            </div>
            <div className="font-semibold text-xl tracking-tight">ThreadForge</div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="text-zinc-400 hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a>
            <button 
              onClick={() => setShowPaywall(true)}
              className="px-4 py-2 bg-white text-zinc-950 rounded-full font-medium text-sm hover:bg-zinc-200 transition-colors"
            >
              Unlock Unlimited
            </button>
          </div>
        </div>
      </nav>

      {/* Free Plan Banner */}
      {!isPaid && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30">
          <div className="max-w-5xl mx-auto px-6 py-3 text-center text-sm">
            <span className="text-yellow-400 font-medium">
              Free plan — {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} generations remaining today
            </span>
            <button 
              onClick={() => setShowPaywall(true)}
              className="ml-3 text-yellow-300 hover:text-white underline font-medium"
            >
              Unlock unlimited for $9
            </button>
            <div className="text-[10px] text-yellow-400/70 mt-1">
              Note: Unlimited access is saved in your browser for now. Clearing browser data will reset it.
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block px-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-sm mb-6 text-zinc-400">
          Used by 2,400+ creators &amp; founders
        </div>

        <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter mb-6">
          Turn any topic into<br />viral X threads.
        </h1>
        
        <p className="text-xl text-zinc-400 max-w-md mx-auto mb-10">
          Generate 3–5 high-quality, ready-to-post threads in seconds.
        </p>

        {/* Generator Input */}
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. building in public, cold email outreach, personal branding..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-lg placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
            />
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className="px-8 py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isGenerating ? 'Generating...' : 'Generate Threads'}
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-3">3 free generations • $9 one-time for unlimited</p>
        </div>
      </div>

      {/* Generated Threads */}
      {demoMode && (
        <div className="max-w-4xl mx-auto px-6 mb-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm px-4 py-2 rounded-2xl text-center">
            Running in demo mode. Add your XAI_API_KEY to <code>.env.local</code> for real Grok-powered threads.
          </div>
        </div>
      )}

      {threads.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pb-20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Your Threads</h2>
            <button 
              onClick={() => setShowPaywall(true)}
              className="text-sm text-zinc-400 hover:text-white"
            >
              Unlock unlimited →
            </button>
          </div>

          <div className="space-y-6">
            {threads.map((thread, index) => (
              <div key={index} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 thread-card">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-sm text-zinc-500">Thread {thread.id}</div>
                    <div className="font-semibold text-lg">{thread.title}</div>
                  </div>
                  <button
                    onClick={() => copyThread(thread)}
                    className="copy-button flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors"
                  >
                    <i className="fas fa-copy"></i>
                    <span>Copy Thread</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {thread.tweets.map((tweet, i) => (
                    <div key={i} className="group flex gap-3">
                      <div className="text-zinc-500 font-mono text-sm w-8 flex-shrink-0 pt-1">
                        {i + 1}/
                      </div>
                      <div className="flex-1 text-[15px] leading-relaxed text-zinc-100">
                        {tweet}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(tweet)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-md self-start mt-1"
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!isPaid && threads.length > 0 && (
            <div className="mt-8 p-6 bg-zinc-900 border border-zinc-800 rounded-3xl text-center">
              <p className="text-lg font-medium mb-2">You’ve reached the free limit</p>
              <p className="text-zinc-400 mb-4">Unlock unlimited threads for life.</p>
              <button 
                onClick={() => setShowPaywall(true)}
                className="inline-flex items-center justify-center px-8 py-3.5 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors text-lg"
              >
                Unlock unlimited threads for $9 one-time
              </button>
            </div>
          )}
        </div>
      )}

      {/* How it Works */}
      <div className="max-w-4xl mx-auto px-6 py-16 border-t border-zinc-800">
        <h2 className="text-3xl font-semibold tracking-tight text-center mb-12">How it works</h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: "1", title: "Enter your topic", desc: "Any idea, niche, or story works." },
            { step: "2", title: "Get 3–5 threads", desc: "High-quality, ready-to-post content." },
            { step: "3", title: "Copy & post", desc: "One click to copy the full thread." }
          ].map((item, index) => (
            <div key={index} className="text-center">
              <div className="mx-auto w-10 h-10 rounded-2xl bg-white text-zinc-950 flex items-center justify-center font-semibold mb-4">
                {item.step}
              </div>
              <div className="font-semibold mb-1">{item.title}</div>
              <div className="text-sm text-zinc-400">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Teaser */}
      <div id="pricing" className="max-w-4xl mx-auto px-6 py-12 text-center border-t border-zinc-800">
        <h3 className="text-2xl font-semibold mb-2">Ready for unlimited threads?</h3>
        <p className="text-zinc-400 mb-6">One-time payment. No subscription.</p>
        <button 
          onClick={() => setShowPaywall(true)}
          className="px-8 py-4 bg-white text-zinc-950 font-semibold rounded-3xl hover:bg-zinc-200"
        >
          Unlock Unlimited for $9
        </button>
      </div>

      {/* Paywall Modal */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-2">Unlock unlimited threads for $9 one-time</h3>
            <p className="text-zinc-400 mb-6">No subscription. Lifetime access.</p>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-4xl font-semibold tracking-tighter">$9</span>
                <span className="text-sm text-zinc-400">one-time • Lifetime</span>
              </div>
              <ul className="text-sm text-zinc-400 space-y-1 mt-4">
                <li>• Unlimited thread generations</li>
                <li>• No limits, ever</li>
                <li>• Lifetime access</li>
              </ul>
            </div>

            <button 
              onClick={handlePayment}
              className="w-full py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 mb-3"
            >
              Pay $9 with Card
            </button>
            
            <button 
              onClick={() => setShowPaywall(false)}
              className="w-full text-sm text-zinc-400 hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>

  {/* Footer */}
  <footer className="border-t border-zinc-800 py-8 text-sm text-zinc-500">
    <div className="max-w-5xl mx-auto px-6 text-center">
      <p>© {new Date().getFullYear()} ThreadForge. All rights reserved.</p>
      <p className="mt-2 text-xs text-zinc-600">
        Note: Unlimited access is saved in your browser for now. Clearing browser data will reset it.
      </p>
    </div>
  </footer>
  )
}
