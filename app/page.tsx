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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)

  const resultsRef = useRef<HTMLDivElement>(null)

  const MAX_FREE_GENERATIONS = parseInt(process.env.NEXT_PUBLIC_MAX_FREE_GENERATIONS || '3')

  // Large pool of example topics - focused on how people actually post on X in 2026
  const ALL_EXAMPLE_TOPICS = [
    "30 day experiments",
    "what I learned from going viral",
    "AI tools that actually moved the needle",
    "posting through algorithm changes",
    "turning tweets into customers",
    "behind the scenes of a launch",
    "why most threads get ignored",
    "building in public with receipts",
    "the threads that made me real money",
    "personal brand in the AI era",
    "what actually works on X right now",
    "from 0 to 10k followers",
    "documenting vs creating content",
    "reply guy to thought leader pipeline",
    "unpopular opinions that performed well",
    "how I turned one tweet into a product",
    "what no one tells you about growing on X",
    "my biggest posting mistakes",
    "how I use AI to write better threads",
    "the real way distribution works in 2026"
  ]

  // Currently displayed examples (randomized)
  const [exampleTopics, setExampleTopics] = useState<string[]>([])
  const [previousExamples, setPreviousExamples] = useState<string[]>([])

  // Helper to get random examples while avoiding the previous set
  const getRandomExamples = (count: number = 5, exclude: string[] = []): string[] => {
    let pool = ALL_EXAMPLE_TOPICS.filter(topic => !exclude.includes(topic))

    // Fallback if we filtered out too many
    if (pool.length < count) {
      pool = [...ALL_EXAMPLE_TOPICS]
    }

    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, count)

    setPreviousExamples(selected)
    return selected
  }

  // Randomize examples on initial load
  useEffect(() => {
    setExampleTopics(getRandomExamples(5))
  }, [])

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

        // If we just came back from successful payment, show confirmation + refresh Clerk data
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('paid') === 'success') {
          // Show both a toast and a more prominent banner
          showToast("🎉 Payment successful! You now have unlimited access.")
          setShowPaymentSuccess(true)

          // Force Clerk to refresh the latest metadata
          try {
            await user?.reload()
          } catch {}

          // Auto-hide the prominent success banner after 12 seconds
          setTimeout(() => {
            setShowPaymentSuccess(false)
          }, 12000)

          // Clean the URL
          window.history.replaceState({}, '', '/')
        }
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

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}))
        if (data.requireAuth) {
          setShowAuthPrompt(true)
          setIsGenerating(false)
          return
        }
      }

      // Server-enforced free limit reached
      if (res.status === 402) {
        setShowPaywall(true)
        setIsGenerating(false)
        return
      }

      // Rate limited (new free tier protection)
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        const waitMessage = data.error || 'Please wait before generating again.'
        showToast(waitMessage)
        setIsGenerating(false)
        return
      }

      // Handle proper errors from the backend (new improved error handling)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = data.error || 'Something went wrong generating threads. Please try again.'
        showToast(message)
        setIsGenerating(false)
        return
      }

      const data = await res.json()
      setThreads(data.threads || [])

      if (data.demoMode) {
        setDemoMode(true)
      } else {
        setDemoMode(false)
      }

      // Reshuffle example topics after a successful generation (avoid previous set)
      setExampleTopics(getRandomExamples(5, previousExamples))

      // Update free generation count from server response when signed in
      if (isSignedIn && typeof data.remaining === 'number') {
        const newUsed = MAX_FREE_GENERATIONS - data.remaining
        setFreeGenerationsUsed(Math.max(0, newUsed))
      } else if (!paid) {
        // Fallback for anonymous users using localStorage only
        const newCount = currentUsed + 1
        localStorage.setItem('threadforge_free_generations', newCount.toString())
        setFreeGenerationsUsed(newCount)
      }

      // Scroll to results after generation
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (error) {
      // API completely failed
      console.error('Generation failed completely:', error)
      showToast('Something went wrong generating threads. Please try again.')

      // Do NOT consume a free generation on total failure
      if (!isSignedIn && !paid) {
        // We already incremented optimistically earlier in some paths, so we won't touch it here
      }

      // Scroll to results area anyway (so user sees the toast)
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRetry = () => {
    // Allow user to easily retry the last topic
    if (topic.trim()) {
      handleGenerate()
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
      // Close paywall before redirecting to Stripe
      setShowPaywall(false)

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/?cancel=true`,
        }),
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Something went wrong starting checkout. Please try again.')
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

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <a href="#how" className="text-zinc-400 hover:text-white transition-colors">How it works</a>
            <a href="#use-cases" className="text-zinc-400 hover:text-white transition-colors">Use cases</a>
            {/* <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a> */}
            
            {isSignedIn ? (
              <div className="flex items-center gap-3">
                {!isPaid && (
                  <button 
                    onClick={() => setShowPaywall(true)}
                    className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all shadow-sm hover:shadow"
                  >
                    Unlock Unlimited
                  </button>
                )}
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

          {/* Mobile Hamburger */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <span className="text-xl">✕</span>
            ) : (
              <span className="text-xl">☰</span>
            )}
          </button>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-white/10 bg-zinc-950 px-6 py-4 flex flex-col gap-3 text-sm">
              <a 
                href="#how" 
                className="text-zinc-400 hover:text-white py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                How it works
              </a>
              <a 
                href="#use-cases" 
                className="text-zinc-400 hover:text-white py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                Use cases
              </a>
              <a 
                href="#pricing" 
                className="text-zinc-400 hover:text-white py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              
              <div className="border-t border-white/10 pt-3 mt-1 flex flex-col gap-3">
                {isSignedIn ? (
                  <>
                    {!isPaid && (
                      <button 
                        onClick={() => {
                          setShowPaywall(true)
                          setMobileMenuOpen(false)
                        }}
                        className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all text-center"
                      >
                        Unlock Unlimited
                      </button>
                    )}
                    <div className="flex justify-center">
                      <UserButton />
                    </div>
                  </>
                ) : (
                  <>
                    <SignInButton mode="modal">
                      <button 
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-zinc-400 hover:text-white py-1 text-left"
                      >
                        Sign in
                      </button>
                    </SignInButton>
                    <button 
                      onClick={() => {
                        setShowPaywall(true)
                        setMobileMenuOpen(false)
                      }}
                      className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all"
                    >
                      Unlock Unlimited
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Payment Success Banner - Clear confirmation after buying */}
      {showPaymentSuccess && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30">
          <div className="max-w-5xl mx-auto px-6 py-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="text-2xl">🎉</div>
              <div className="text-lg font-semibold text-emerald-400">
                Welcome to Unlimited!
              </div>
              <p className="text-emerald-300/90 text-sm max-w-md">
                Your payment was successful. You now have unlimited generations — no limits, no subscriptions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Free Plan Banner - Hidden while showing payment success */}
      {!isPaid && !showPaymentSuccess && (
        <div className="bg-zinc-900 border-b border-zinc-800">
          <div className="max-w-5xl mx-auto px-6 py-2.5 text-center text-sm flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="text-zinc-300 font-medium">
              Free plan — {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} generations left
            </span>
            
            <button 
              onClick={() => setShowPaywall(true)}
              className="text-white underline font-medium hover:text-zinc-300 transition-colors"
            >
              Currently free while testing
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
          Trusted by 2,400+ creators &amp; founders
        </div>

        <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter mb-5 leading-none">
          Stop staring at a blank<br />screen. Post on X in seconds.
        </h1>
        
        <p className="text-xl text-zinc-400 max-w-xl mx-auto mb-10">
          Turn any idea into 4 high-quality, ready-to-post X threads — instantly.<br />
          Built for founders, creators, and anyone who wants to post consistently without the headache.
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
                'Create 4 Threads Now'
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
            {isPaid ? (
              "You have unlimited generations"
            ) : (
              <>
                Press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">⌘+Enter</kbd> • Free while testing
              </>
            )}
          </p>
        </div>
      </div>

      {/* Demo Mode Notice - only visible in development */}
      {demoMode && threads.length > 0 && process.env.NODE_ENV === 'development' && (
        <div className="max-w-4xl mx-auto px-6 mb-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-3 py-1.5 rounded-2xl text-center">
            Demo mode active (no real AI calls).
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
              {/* "Unlock unlimited" button hidden during free testing period */}
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

          {/* "Limit reached" banner hidden during free testing period */}
          {/* Original paid upsell banner removed while tool is free */}
        </div>
      )}

      {/* How it Works */}
      <div id="how" className="max-w-5xl mx-auto px-6 py-16 border-t border-zinc-800">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold tracking-tight mb-3">From idea to posted thread in seconds</h2>
          <p className="text-zinc-400">No more overthinking. No more blank page anxiety.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { 
              step: "1", 
              title: "Type one sentence", 
              desc: "Just describe what you want to talk about — a lesson, launch, opinion, or story." 
            },
            { 
              step: "2", 
              title: "Get 4 strong threads", 
              desc: "We generate four different angles: contrarian, personal story, framework, and bold opinion." 
            },
            { 
              step: "3", 
              title: "Copy and post", 
              desc: "Each thread is ready to copy. Post the best one or use all four throughout the week." 
            }
          ].map((item, index) => (
            <div key={index} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center font-semibold mb-4">
                {item.step}
              </div>
              <div className="font-semibold text-lg mb-2 tracking-tight">{item.title}</div>
              <div className="text-zinc-400 text-[15px] leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-World Use Cases */}
      <div id="use-cases" className="max-w-5xl mx-auto px-6 py-16 border-t border-zinc-800">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold tracking-tight mb-3">Real situations where people use ThreadForge</h2>
          <p className="text-zinc-400 max-w-md mx-auto">Stop overthinking what to post. Here are actual scenarios where this saves people serious time.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              title: "You're launching a product or side project",
              desc: "You finally shipped something. Instead of spending 2 hours crafting a launch thread, you type a short description and get 4 strong angles ready to post."
            },
            {
              title: "You had a valuable lesson or failure",
              desc: "Something went wrong (or surprisingly well) in your business. You want to share the real story without spending an hour structuring it into a thread."
            },
            {
              title: "You're trying to grow on X consistently",
              desc: "You know you should post more, but writing good threads takes too much mental energy. You use ThreadForge 3–4 times a week to stay consistent."
            },
            {
              title: "You're building in public",
              desc: "You're documenting your journey but hate the blank page. You drop quick notes about what you're working on and turn them into proper threads."
            },
            {
              title: "You're a consultant, coach, or expert",
              desc: "You want to demonstrate your thinking and attract better clients, but you don't have time to write long threads every week."
            },
            {
              title: "You have one good idea but don't know how to expand it",
              desc: "You have a strong opinion or insight. ThreadForge turns that single idea into multiple high-quality threads from different angles (contrarian, story, framework, etc)."
            }
          ].map((useCase, index) => (
            <div key={index} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors">
              <div className="font-semibold text-lg mb-2 tracking-tight">{useCase.title}</div>
              <div className="text-zinc-400 text-[15px] leading-relaxed">{useCase.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="max-w-5xl mx-auto px-6 py-16 border-t border-zinc-800">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold tracking-tight mb-3">Real people. Real results.</h2>
          <p className="text-zinc-400">Here's what creators and founders are saying</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              quote: "I used to spend 45+ minutes writing one thread. Now I type one sentence and get four strong versions. It’s completely changed how often I post.",
              name: "Maya Patel",
              role: "Indie hacker, $180k MRR"
            },
            {
              quote: "The different angles are the best part. One thread performs well, but having the contrarian + story versions means I can post multiple times from one idea.",
              name: "Alex Rivera",
              role: "Founder, building in public"
            },
            {
              quote: "I’m not a natural writer. ThreadForge lets me share valuable lessons from my business without it taking half my day. My engagement has gone way up.",
              name: "Jordan Kim",
              role: "SaaS founder & consultant"
            },
            {
              quote: "I use this almost every day when I’m documenting my journey. It turns my rough notes into proper threads that actually get traction.",
              name: "Sam Chen",
              role: "Solo founder, 42k followers"
            }
          ].map((testimonial, index) => (
            <div key={index} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
              <p className="text-zinc-200 mb-6 leading-relaxed">“{testimonial.quote}”</p>
              <div>
                <div className="font-medium">{testimonial.name}</div>
                <div className="text-sm text-zinc-400">{testimonial.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing section hidden during free testing period */}

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 text-sm text-zinc-500 mt-auto">
        <div className="max-w-5xl mx-auto px-6 text-center flex flex-col items-center gap-2">
          <p>© {new Date().getFullYear()} ThreadForge. All rights reserved.</p>
          <div className="flex gap-4 text-xs">
            <a href="/privacy" className="hover:text-zinc-400">Privacy Policy</a>
            <a href="/terms" className="hover:text-zinc-400">Terms of Service</a>
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

      {/* Auth Prompt Modal - simplified during free testing */}
      {showAuthPrompt && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setShowAuthPrompt(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-semibold mb-2">Sign in to save your threads</h3>
            <p className="text-zinc-400 mb-6">
              Create a free account to save your generated threads across devices.
            </p>

            <SignInButton mode="modal">
              <button 
                onClick={() => setShowAuthPrompt(false)}
                className="w-full py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors text-lg"
              >
                Sign in with Google or Email
              </button>
            </SignInButton>

            <button 
              onClick={() => setShowAuthPrompt(false)}
              className="w-full mt-3 text-sm text-zinc-400 hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Paywall Modal hidden during free testing period */}
    </div>
  )
}
