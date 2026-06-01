'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'

interface Thread {
  id: number
  title: string
  tweets: string[]
}

export default function Page() {
  const { isSignedIn, user } = useUser()
  const hasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)

  const [topic, setTopic] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0)
  const [copiedThreadId, setCopiedThreadId] = useState<number | null>(null)
  const [copiedTweetKey, setCopiedTweetKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const resultsRef = useRef<HTMLDivElement>(null)

  const MAX_FREE_GENERATIONS = parseInt(process.env.NEXT_PUBLIC_MAX_FREE_GENERATIONS || '3') // Daily free tier limit for non-Pro users

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

  // Load free generation status (real product mode with daily reset awareness)
  useEffect(() => {
    const loadStatus = () => {
      if (isSignedIn && hasPro) {
        // Pro users have unlimited generations
        setFreeGenerationsUsed(0)
        return
      }

      if (isSignedIn && user?.publicMetadata) {
        // Signed-in free user: read authoritative count from Clerk
        const meta = user.publicMetadata as any
        const serverUsed = meta.freeGenerationsUsed ?? 0
        const lastDate = meta.lastFreeGenerationDate

        const today = new Date().toISOString().split('T')[0]
        const effectiveUsed = lastDate === today ? serverUsed : 0

        // Also sync localStorage for consistency
        localStorage.setItem('threadforge_free_generations', effectiveUsed.toString())
        setFreeGenerationsUsed(effectiveUsed)
        return
      }

      // Anonymous users: use localStorage
      const used = getFreeGenerationsUsed()
      setFreeGenerationsUsed(used)
    }

    loadStatus()

    // Auto-focus input on load for better UX
    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    if (input) {
      setTimeout(() => input.focus(), 300)
    }
  }, [isSignedIn, user, hasPro])

  // Load free generation count (used for anonymous + fallback for signed-in free users)
  const getFreeGenerationsUsed = () => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('threadforge_free_generations') || '0')
    }
    return 0
  }

  const handleGenerate = async () => {
    const cleanTopic = topic.trim()

    if (!cleanTopic) return

    if (cleanTopic.length < 3) {
      showToast("Please enter at least 3 characters")
      return
    }
    if (cleanTopic.length > 180) {
      showToast("Topic is too long (max 180 characters)")
      return
    }

    setIsGenerating(true)

    // Real free tier rules:
    // - Free users (no Pro): limited to 3 generations per day
    // - Pro users: unlimited
    const currentUsed = freeGenerationsUsed

    // Block if user does not have Pro and has used their daily free allowance
    if (!hasPro && currentUsed >= MAX_FREE_GENERATIONS) {
      setShowAuthPrompt(true)
      setIsGenerating(false)
      return
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: cleanTopic })
      })

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}))
        if (data.requireAuth) {
          setShowAuthPrompt(true)
          setIsGenerating(false)
          return
        }
      }

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        const waitMessage = data.error || 'Please wait a moment before generating again.'
        showToast(waitMessage, 'error')
        setIsGenerating(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = data.error || 'Something went wrong while generating threads. Please try again.'
        showToast(message, 'error')
        setIsGenerating(false)
        return
      }

      const data = await res.json()
      setThreads(data.threads || [])
      setDemoMode(!!data.demoMode)

      // Reshuffle example topics
      setExampleTopics(getRandomExamples(5, previousExamples))

      // Sync free usage counter from server (authoritative, handles daily reset)
      if (!hasPro && typeof data.freeGenerationsUsed === 'number') {
        const serverCount = data.freeGenerationsUsed
        localStorage.setItem('threadforge_free_generations', serverCount.toString())
        setFreeGenerationsUsed(serverCount)
      } else if (!hasPro) {
        // Fallback for older responses
        const newCount = currentUsed + 1
        localStorage.setItem('threadforge_free_generations', newCount.toString())
        setFreeGenerationsUsed(newCount)
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (error) {
      console.error('Generation failed:', error)
      showToast('We ran into a problem generating your threads. Please try again in a moment.', 'error')
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

  const handleUpgrade = async () => {
    if (!isSignedIn) {
      setShowAuthPrompt(true)
      return
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/?canceled=true`,
        })
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        showToast(data.error || 'Unable to start checkout. Please try again.', 'error')
      }
    } catch (err) {
      console.error('Checkout error', err)
      showToast('Failed to connect to payment system. Please try again in a moment.', 'error')
    }
  }

  const copyThread = (thread: Thread) => {
    const fullThread = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(fullThread)

    // Visual feedback using state
    setCopiedThreadId(thread.id)
    showToast('Thread copied to clipboard', 'success')

    setTimeout(() => {
      setCopiedThreadId(null)
    }, 1500)
  }

  const copyTweet = (threadId: number, tweetIndex: number, tweet: string) => {
    navigator.clipboard.writeText(tweet)
    const key = `${threadId}-${tweetIndex}`
    setCopiedTweetKey(key)
    showToast('Tweet copied', 'success')

    setTimeout(() => {
      setCopiedTweetKey(null)
    }, 1200)
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 2600)
  }

  // handlePayment removed (now handled via the Pricing section)

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
            <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a>
            
            {isSignedIn ? (
              <div className="flex items-center gap-3">
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
                  <div className="flex justify-center">
                    <UserButton />
                  </div>
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
                    <SignUpButton mode="modal">
                      <button 
                        onClick={() => setMobileMenuOpen(false)}
                        className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all text-center"
                      >
                        Get Started Free
                      </button>
                    </SignUpButton>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Free Tier Banner - real product mode with live counter */}
      <div className="bg-zinc-900/80 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-2.5 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-400">
            {isSignedIn && !hasPro ? (
              <>
                <span>
                  Free: <span className="text-white font-semibold">{Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS}</span> generations left today
                </span>
                <span className="hidden sm:inline">•</span>
                <span>Upgrade to Pro for unlimited</span>
              </>
            ) : (
              <>
                <span>
                  Free tier: <span className="text-white font-medium">3 generations per day</span>
                </span>
                <span className="hidden sm:inline">•</span>
                <span>
                  Pro users get unlimited generations
                </span>
              </>
            )}
            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className="ml-1 underline text-violet-400 hover:text-violet-300 transition-colors">
                  Sign in to track your usage
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </div>

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
          Built for creators and founders who actually post
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

          {/* Visible free usage counter for signed-in free users */}
          {isSignedIn && !hasPro && (
            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-white/10 px-3 py-1 text-xs text-zinc-400">
                <span className="text-emerald-400">●</span>
                {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} free generations left today
              </span>
            </div>
          )}

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
            {isSignedIn ? (
              "Unlimited generations (free testing phase)"
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
              {/* Payment upsells removed during testing phase */}
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

          {/* Free usage limit is enforced in handleGenerate */}
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
          <p className="text-zinc-400">Real feedback from people using ThreadForge</p>
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

      {/* Pricing - Option B: Free vs Pro comparison cards with cancel anytime */}
      <div id="pricing" className="max-w-5xl mx-auto px-6 py-16 border-t border-zinc-800">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-4">PRICING</div>
          <h2 className="text-4xl font-semibold tracking-tighter mb-3">Free to start.<br className="hidden sm:block" /> Pro when you need it.</h2>
          <p className="text-zinc-400 max-w-md mx-auto">Generous free tier forever. Pro unlocks unlimited + premium features as we launch them.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-[860px] mx-auto">
          {/* Free Tier Card */}
          <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-8 flex flex-col">
            <div className="mb-6">
              <div className="uppercase text-emerald-400 text-xs tracking-[1.5px] font-medium mb-1">FREE</div>
              <div className="flex items-end gap-1">
                <span className="text-[52px] leading-none font-semibold tracking-[-2px]">$0</span>
              </div>
              <div className="text-sm text-zinc-500 mt-1">No credit card required</div>
            </div>

            <ul className="space-y-[13px] text-[15px] mb-auto text-zinc-200">
              <li className="flex items-start gap-3"><span className="mt-1.5 text-emerald-400">•</span> 3 generations per day</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-emerald-400">•</span> 4 high-quality thread variants</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-emerald-400">•</span> Copy individual tweets or full thread</li>
              <li className="flex items-start gap-3 text-zinc-400"><span className="mt-1.5">•</span> Upgrade to Pro for unlimited</li>
            </ul>

            <div className="mt-8 pt-6 border-t border-white/10 text-xs text-zinc-500 leading-snug">
              No credit card required. Upgrade anytime.
            </div>
          </div>

          {/* Pro Tier Card - highlighted */}
          <div className="rounded-3xl border-2 border-violet-500/70 bg-zinc-900 p-8 flex flex-col relative shadow-xl">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-px text-[10px] font-semibold tracking-[1px] bg-violet-500 text-white rounded-full">MOST POPULAR</div>

            <div className="mb-6">
              <div className="uppercase text-violet-400 text-xs tracking-[1.5px] font-medium mb-1 flex items-center gap-2">
                PRO
                {hasPro && <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-px rounded">ACTIVE</span>}
              </div>
              <div className="flex items-end gap-1">
                <span className="text-[52px] leading-none font-semibold tracking-[-2px]">$9</span>
                <span className="text-zinc-400 pb-1">/mo</span>
              </div>
              <div className="text-emerald-400 text-sm mt-0.5 font-medium">Cancel anytime • No long-term contract</div>
            </div>

            <ul className="space-y-[13px] text-[15px] mb-auto text-zinc-200">
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> <strong>Unlimited</strong> generations</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Priority generation speed</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Full history of past threads</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> One-click post to X (soon)</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Smart emoji &amp; hashtag suggestions</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Early access to new AI features</li>
            </ul>

            {hasPro ? (
              <div className="mt-8">
                <div className="w-full py-4 bg-emerald-500/10 text-emerald-400 font-semibold rounded-2xl text-center text-lg border border-emerald-500/30">
                  ✓ You have Pro
                </div>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Manage subscription via Stripe (coming soon)</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleUpgrade}
                  className="mt-8 w-full py-4 bg-white hover:bg-zinc-100 active:bg-zinc-200 transition-all text-zinc-950 font-semibold rounded-2xl text-lg shadow-sm"
                >
                  Upgrade to Pro — $9/mo
                </button>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Billed monthly. Cancel in seconds.</p>
              </>
            )}
          </div>
        </div>

        <p className="text-center mt-8 text-xs text-zinc-500">Pro activates instantly. Real Pro features (history, one-click to X, etc.) coming soon.</p>
      </div>

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

      {/* Toast notification - improved */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm shadow-xl flex items-center gap-2 border ${
          toast.type === 'error' 
            ? 'bg-red-500/10 border-red-500/40 text-red-300' 
            : toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-zinc-900 border-zinc-700 text-zinc-200'
        }`}>
          <span>
            {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : 'ℹ️'}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Auth Prompt Modal */}
      {showAuthPrompt && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setShowAuthPrompt(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-semibold mb-2">You've reached your free limit</h3>
            <p className="text-zinc-400 mb-6">
              Free users get 3 generations per day. Sign in to continue with your daily allowance, or upgrade to Pro for unlimited generations.
            </p>

            <SignInButton mode="modal">
              <button 
                onClick={() => setShowAuthPrompt(false)}
                className="w-full py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors text-lg"
              >
                Sign in to continue free
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
    </div>
  )
}
