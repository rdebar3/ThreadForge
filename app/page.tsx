'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, SignInButton, UserButton } from '@clerk/nextjs'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

export default function Page() {
  const { isSignedIn, user } = useUser()

  const [topic, setTopic] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0)
  const [copiedThreadId, setCopiedThreadId] = useState<number | null>(null)
  const [copiedTweetKey, setCopiedTweetKey] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)

  const resultsRef = useRef<HTMLDivElement>(null)

  const MAX_FREE_GENERATIONS = 3

  // Example topics for one-click generation
  const exampleTopics = [
    "building in public",
    "cold email outreach",
    "personal branding",
    "indie hacking",
    "founder mental health"
  ]

  // Load paid status and free generation count on mount + when Clerk user changes
  useEffect(() => {
    const loadStatus = async () => {
      // If user is signed in via Clerk, prefer Clerk metadata
      if (isSignedIn && user) {
        const metadata = user.publicMetadata as {
          hasPaid?: boolean
          freeGenerationsUsed?: number
        }

        const clerkIsPaid = metadata?.hasPaid === true
        const clerkUsed = metadata?.freeGenerationsUsed ?? 0

        setIsPaid(clerkIsPaid)
        setFreeGenerationsUsed(clerkUsed)
        return
      }

      // Fall back to localStorage for anonymous users
      const paid = checkPaidStatus()
      setIsPaid(paid)

      const used = getFreeGenerationsUsed()
      setFreeGenerationsUsed(used)
    }

    loadStatus()

    // Auto-focus input on load for better UX
    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    if (input) {
      setTimeout(() => input.focus(), 300)
    }
  }, [isSignedIn, user])

  // Close paywall on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPaywall) {
        setShowPaywall(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showPaywall])

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

  // Client-side fallback generator (used when API is unreachable)
  const generateThreads = (topic: string): Thread[] => {
    const cleanTopic = topic.toLowerCase()
    return [
      {
        id: 1,
        title: "The Contrarian Take",
        tweets: [
          `1/ Most people get ${cleanTopic} completely wrong.`,
          `2/ They focus on the obvious stuff and miss what actually moves the needle.`,
          `3/ After studying this for months, here's the uncomfortable truth:`,
          `4/ The people winning aren't doing what the gurus are teaching.`,
          `5/ They're doing the boring, unsexy version that actually compounds.`,
          `6/ Save this if you're serious about ${cleanTopic}.`
        ]
      },
      {
        id: 2,
        title: "Story + Lesson",
        tweets: [
          `1/ I used to suck at ${cleanTopic}.`,
          `2/ I tried all the popular advice. Nothing worked.`,
          `3/ Then I tried something different.`,
          `4/ Within 60 days, everything changed.`,
          `5/ Here's exactly what I did differently:`,
          `6/ The biggest lesson? Stop chasing tactics. Start building systems.`
        ]
      },
      {
        id: 3,
        title: "Simple Framework",
        tweets: [
          `1/ Here's the exact framework I use for ${cleanTopic}:`,
          `2/ Step 1: Start embarrassingly small.`,
          `3/ Step 2: Focus only on the highest leverage action.`,
          `4/ Step 3: Create fast feedback loops.`,
          `5/ Most people skip step 2 and 3. That's why they stay stuck.`,
          `6/ Do this consistently and results become inevitable.`
        ]
      },
      {
        id: 4,
        title: "Bold Opinion",
        tweets: [
          `1/ Hot take on ${cleanTopic}:`,
          `2/ The "beginner friendly" advice is actually keeping most people stuck.`,
          `3/ Real progress requires doing the hard, uncomfortable version early.`,
          `4/ Comfort is the enemy of growth in this game.`,
          `5/ If it feels easy, you're probably not doing it right yet.`,
          `6/ The people who win embrace the discomfort early.`
        ]
      }
    ]
  }

  const handleGenerate = async () => {
    if (!topic.trim()) return

    // Use the state we maintain (Clerk-aware for logged-in users, localStorage for anonymous)
    const paid = isPaid
    const currentUsed = freeGenerationsUsed

    if (!paid && currentUsed >= MAX_FREE_GENERATIONS) {
      if (isSignedIn) {
        setShowPaywall(true)
      } else {
        setShowAuthPrompt(true)
      }
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

      // Track free generations (Clerk if logged in, localStorage if anonymous)
      if (!paid) {
        const newCount = currentUsed + 1
        await trackFreeGeneration(newCount)
        setFreeGenerationsUsed(newCount)
      }

      // Scroll to results after generation
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (error) {
      // Fallback to client generation if API fails
      const generated = generateThreads(topic.trim())
      setThreads(generated)
      setDemoMode(true)

      if (!paid) {
        const newCount = currentUsed + 1
        await trackFreeGeneration(newCount)
        setFreeGenerationsUsed(newCount)
      }

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } finally {
      setIsGenerating(false)
    }
  }

  // Track free generation usage (Clerk metadata if signed in, else localStorage)
  const trackFreeGeneration = async (newCount: number) => {
    if (isSignedIn && user) {
      try {
        await fetch('/api/track-generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ freeGenerationsUsed: newCount }),
        })
      } catch (e) {
        console.error('Failed to track generation in Clerk')
      }
    } else {
      localStorage.setItem('threadforge_free_generations', newCount.toString())
    }
  }

  const copyThread = (thread: Thread) => {
    const fullThread = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(fullThread)

    // Visual feedback using state
    setCopiedThreadId(thread.id)
    showToast('Thread copied to clipboard')

    setTimeout(() => {
      setCopiedThreadId(null)
    }, 1500)
  }

  const copyTweet = (threadId: number, tweetIndex: number, tweet: string) => {
    navigator.clipboard.writeText(tweet)
    const key = `${threadId}-${tweetIndex}`
    setCopiedTweetKey(key)
    showToast('Tweet copied')

    setTimeout(() => {
      setCopiedTweetKey(null)
    }, 1200)
  }

  const showToast = (message: string) => {
    setToast(message)
    // Auto dismiss
    setTimeout(() => {
      setToast(null)
    }, 2200)
  }

  const handlePayment = async () => {
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/`,
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

  // Simple inline copy icon (replaces Font Awesome)
  const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
    </svg>
  )

  // Loading spinner
  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-x-hidden">
      {/* Navbar - Slightly more premium */}
      <nav className="border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Custom Logo - Modern & Distinctive */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-9 h-9">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-400 via-indigo-500 to-violet-400 rounded-2xl opacity-90"></div>
                <div className="relative w-9 h-9 bg-zinc-950 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="text-white text-[21px] font-bold tracking-[-1.5px]">TF</span>
                </div>
              </div>
              <div className="font-semibold text-2xl tracking-tighter">ThreadForge</div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a href="#how" className="text-zinc-400 hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a>
            
            {isSignedIn ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowPaywall(true)}
                  className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all shadow-sm hover:shadow"
                >
                  Unlock Unlimited
                </button>
                <UserButton 
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8"
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <SignInButton mode="modal">
                  <button className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
                    Sign in
                  </button>
                </SignInButton>
                <button 
                  onClick={() => setShowPaywall(true)}
                  className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all shadow-sm hover:shadow"
                >
                  Unlock Unlimited
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Free Plan Banner - Redesigned to be less intrusive and more premium */}
      {!isPaid && (
        <div className="bg-zinc-900 border-b border-zinc-800">
          <div className="max-w-5xl mx-auto px-6 py-2.5 text-center text-sm flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="text-zinc-300 font-medium">
              Free plan — {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} generations left
            </span>
            
            <button 
              onClick={() => setShowPaywall(true)}
              className="text-white underline font-medium hover:text-zinc-300 transition-colors"
            >
              Get unlimited for $9
            </button>

            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className="text-zinc-400 hover:text-white underline text-xs transition-colors">
                  Sign in to save your progress
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      )}

      {/* Hero - Stronger, more premium design */}
      <div className="relative max-w-5xl mx-auto px-6 pt-12 pb-16 text-center">
        
        {/* Rich background treatment for depth and interest */}
        <div className="absolute inset-0 -z-10">
          {/* Subtle grid + gradient mesh */}
          <div className="absolute inset-0 bg-[radial-gradient(#1f1f23_1px,transparent_1px)] bg-[length:3px_3px]"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-violet-950/30 via-transparent to-transparent"></div>
          
          {/* Soft glowing orbs for visual interest */}
          <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-violet-500/20 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-indigo-500/15 rounded-full blur-[120px]"></div>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-sm mb-6 text-zinc-300">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></span>
          Used by 2,400+ creators &amp; founders
        </div>

        <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter mb-5 leading-none">
          Turn any idea into<br />scroll-stopping X threads.
        </h1>
        
        <p className="text-xl text-zinc-400 max-w-lg mx-auto mb-10">
          Stop staring at a blank screen.<br />
          Generate 4 high-quality, ready-to-post threads in seconds.
        </p>

        {/* Generator Input */}
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating) {
                  handleGenerate()
                }
              }}
              placeholder="e.g. building in public, cold email outreach, personal branding..."
              disabled={isGenerating}
              className="flex-1 bg-zinc-900/80 border border-white/10 focus:border-violet-400 rounded-2xl px-6 py-4 text-lg placeholder:text-zinc-500 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className="px-8 py-4 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 active:from-violet-700 active:to-indigo-700 text-white font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-2 min-w-[180px] shadow-lg hover:shadow-xl"
            >
              {isGenerating ? (
                <>
                  <Spinner />
                  <span>Generating...</span>
                </>
              ) : (
                'Generate Threads'
              )}
            </button>
          </div>

          {/* Example topic chips - More fun & prominent */}
          {!threads.length && (
            <div className="mt-5">
              <div className="text-xs text-zinc-500 mb-2 tracking-wider">TRY AN EXAMPLE</div>
              <div className="flex flex-wrap justify-center gap-2">
                {exampleTopics.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTopic(example)
                      setTimeout(() => handleGenerate(), 40)
                    }}
                    disabled={isGenerating}
                    className="text-sm px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all active:scale-[0.985] disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-500 mt-3">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">⌘+Enter</kbd> • 3 free generations • $9 one-time
          </p>
        </div>
      </div>

      {/* Demo Mode Notice */}
      {demoMode && threads.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 mb-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm px-4 py-2 rounded-2xl text-center">
            Running in demo mode. Add your XAI_API_KEY to <code>.env.local</code> for real Grok-powered threads.
          </div>
        </div>
      )}

      {/* Generated Threads */}
      {threads.length > 0 && (
        <div ref={resultsRef} className="max-w-4xl mx-auto px-6 pb-20">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-y-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Your Threads</h2>
              <p className="text-sm text-zinc-500">Ready to post. Just copy &amp; go.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setThreads([])
                  setTopic('')
                  setDemoMode(false)
                  setTimeout(() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    input?.focus()
                  }, 50)
                }}
                className="text-sm px-5 py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all"
              >
                New topic
              </button>
              <button 
                onClick={() => setShowPaywall(true)}
                className="text-sm px-5 py-2.5 rounded-2xl bg-violet-500/10 text-violet-300 hover:bg-violet-500 hover:text-white transition-all font-medium"
              >
                Unlock unlimited →
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {threads.map((thread) => (
              <div key={thread.id} className="bg-zinc-900/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 thread-card hover:border-white/20 hover:bg-zinc-900/90 transition-all group shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-xs font-medium text-violet-400 tracking-[1.5px] mb-1">THREAD {thread.id}</div>
                    <div className="font-semibold text-[21px] leading-tight pr-4">{thread.title}</div>
                  </div>
                  <button
                    onClick={() => copyThread(thread)}
                    className="copy-button flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                  >
                    <CopyIcon />
                    <span>{copiedThreadId === thread.id ? 'Copied!' : 'Copy Thread'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {thread.tweets.map((tweet, i) => {
                    const key = `${thread.id}-${i}`
                    const isCopied = copiedTweetKey === key
                    return (
                      <div key={i} className="group flex gap-3 rounded-xl hover:bg-zinc-950/60 px-3 py-2 -mx-3 transition-colors">
                        <div className="text-zinc-500 font-mono text-sm w-8 flex-shrink-0 pt-0.5 select-none">
                          {i + 1}/
                        </div>
                        <div className="flex-1 text-[15px] leading-relaxed text-zinc-100">
                          {tweet}
                        </div>
                        <button
                          onClick={() => copyTweet(thread.id, i, tweet)}
                          className="opacity-0 group-hover:opacity-100 text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-lg self-start mt-0.5 transition-all text-zinc-400 hover:text-white flex items-center gap-1.5"
                        >
                          {isCopied ? (
                            <span className="text-emerald-400 font-medium">Copied!</span>
                          ) : (
                            <>
                              <span className="hidden sm:inline">Copy</span>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
                              </svg>
                            </>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {!isPaid && threads.length > 0 && (
            <div className="mt-8 p-8 bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-3xl text-center">
              <div className="mb-4">
                <span className="text-4xl">🔒</span>
              </div>
              <p className="text-xl font-semibold mb-2">You’ve used your free generations</p>
              <p className="text-zinc-400 mb-6 max-w-sm mx-auto">
                {isSignedIn 
                  ? "Unlock unlimited threads forever for just $9 one-time." 
                  : "Sign in to save your progress + get more free generations, or unlock unlimited for $9."
                }
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {!isSignedIn && (
                  <SignInButton mode="modal">
                    <button className="px-8 py-3.5 border border-white/20 text-white font-semibold rounded-2xl hover:bg-white/10 transition-colors text-base">
                      Sign in for free
                    </button>
                  </SignInButton>
                )}
                <button 
                  onClick={() => setShowPaywall(true)}
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-semibold rounded-2xl hover:from-violet-600 hover:to-indigo-600 transition-all text-base shadow-lg"
                >
                  Unlock unlimited for $9
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it Works */}
      <div id="how" className="max-w-4xl mx-auto px-6 py-16 border-t border-zinc-800">
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

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 text-sm text-zinc-500 mt-auto">
        <div className="max-w-5xl mx-auto px-6 text-center flex flex-col items-center gap-2">
          <p>© {new Date().getFullYear()} ThreadForge. All rights reserved.</p>
          <div className="flex gap-4 text-xs">
            <a href="/privacy" className="hover:text-zinc-400">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400">Terms</a>
            <a href="/refund" className="hover:text-zinc-400">Refund Policy</a>
          </div>
        </div>
      </footer>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 shadow-xl flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          {toast}
        </div>
      )}

      {/* Auth / Sign-in Prompt Modal (shown when anonymous user hits free limit) */}
      {showAuthPrompt && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setShowAuthPrompt(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-semibold mb-2">You’ve used your 3 free generations</h3>
            <p className="text-zinc-400 mb-6">
              Sign in for free to save your progress across devices and get 3 more free generations on your account.
            </p>

            <div className="space-y-3">
              <SignInButton mode="modal">
                <button 
                  onClick={() => setShowAuthPrompt(false)}
                  className="w-full py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors text-lg"
                >
                  Sign in with Google or Email
                </button>
              </SignInButton>

              <button 
                onClick={() => {
                  setShowAuthPrompt(false)
                  setShowPaywall(true)
                }}
                className="w-full py-4 border border-zinc-700 text-white font-medium rounded-2xl hover:bg-zinc-800 transition-colors"
              >
                Or pay $9 for unlimited instead
              </button>
            </div>

            <p className="text-center text-xs text-zinc-500 mt-4">
              No credit card required to sign in.
            </p>
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      {showPaywall && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setShowPaywall(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPaywall(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="text-5xl mb-4">✨</div>
              <h3 className="text-3xl font-semibold tracking-tight">Go unlimited</h3>
              <p className="text-zinc-400 mt-2">One-time payment. No subscriptions. Lifetime access.</p>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <span className="text-5xl font-semibold tracking-tighter">$9</span>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-semibold text-sm">ONE-TIME</div>
                  <div className="text-zinc-400 text-xs">Lifetime access</div>
                </div>
              </div>
              <ul className="text-sm text-zinc-300 space-y-2 pt-4 border-t border-zinc-800">
                <li className="flex items-center gap-2">✓ Unlimited thread generations</li>
                <li className="flex items-center gap-2">✓ No limits, ever</li>
                <li className="flex items-center gap-2">✓ Works on any account</li>
              </ul>
            </div>

            <button 
              onClick={handlePayment}
              className="w-full py-4 bg-white hover:bg-zinc-100 active:bg-zinc-200 text-zinc-950 font-semibold rounded-2xl mb-3 transition-all text-lg active:scale-[0.985]"
            >
              Pay $9 with Card
            </button>
            
            <button 
              onClick={() => setShowPaywall(false)}
              className="w-full text-sm text-zinc-400 hover:text-white py-2 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
