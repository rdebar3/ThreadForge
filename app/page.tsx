'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'
import { IMAGE_STYLES, type ImageStyle } from './lib/prompts'

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
  const [suggestions, setSuggestions] = useState<Record<string, {emojis: string[], hashtags: string[]}>>({})
  const [suggestLoading, setSuggestLoading] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Image generation states (Pro-only)
  const [showImageModalFor, setShowImageModalFor] = useState<number | null>(null)
  const [selectedImageStyle, setSelectedImageStyle] = useState<ImageStyle>('auto')
  const [selectedImageCount, setSelectedImageCount] = useState(4)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [threadImages, setThreadImages] = useState<Record<number, Array<{url: string, style: string, revisedPrompt?: string}>>>({})

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
        if (hasPro) {
          showToast(`Priority: ${waitMessage}`, 'info')
        } else {
          showToast(waitMessage, 'error')
        }
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
    showToast('Full thread copied', 'success')

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

  const copyToX = (thread: Thread) => {
    const formatted = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(formatted)
    showToast('Copied to clipboard and opened X composer', 'success')
    // Open X compose with first tweet for convenience
    const firstTweet = encodeURIComponent(thread.tweets[0])
    window.open(`https://x.com/compose/tweet?text=${firstTweet}`, '_blank')
  }

  const suggestForTweet = async (threadId: number, tweetIndex: number, tweet: string) => {
    const key = `${threadId}-${tweetIndex}`
    setSuggestLoading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet, topic })
      })
      const data = await res.json()
      if (res.ok && data.emojis) {
        setSuggestions(prev => ({ ...prev, [key]: { emojis: data.emojis, hashtags: data.hashtags } }))
        showToast('Suggestions added!', 'success')
      } else {
        showToast(data.error || 'Failed to get suggestions', 'error')
      }
    } catch (e) {
      showToast('Failed to get suggestions. Please try again.', 'error')
    } finally {
      setSuggestLoading(prev => ({ ...prev, [key]: false }))
    }
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

  // X (Twitter) logo icon for Post to X button
  const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25l-7.451 8.52L4.5 2.25H1.5l7.5 8.5L1.5 21.75h3l6.75-7.71 6.75 7.71h3l-7.5-8.5 7.5-8.5h-3z" />
    </svg>
  )

  // Loading spinner
  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  )

  // Image generation helpers (Pro-only)
  async function downloadImage(url: string, filename: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      // fallback direct
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
    }
  }

  async function copyImageToClipboard(url: string) {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      showToast('Image copied to clipboard', 'success')
    } catch (e) {
      await navigator.clipboard.writeText(url)
      showToast('Image URL copied (image copy not supported)', 'info')
    }
  }

  async function handleGenerateImages(thread: Thread) {
    if (!hasPro) return
    setIsGeneratingImages(true)
    try {
      const res = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          threadId: thread.id,
          title: thread.title,
          tweets: thread.tweets,
          style: selectedImageStyle,
          count: selectedImageCount
        })
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requireUpgrade) {
          showToast('Image generation is a Pro feature. Upgrade to unlock.', 'info')
        } else if (data.rateLimited) {
          showToast(data.error || 'Please wait before generating more images.', 'info')
        } else {
          showToast(data.error || 'Failed to generate images', 'error')
        }
        return
      }
      setThreadImages(prev => ({ ...prev, [thread.id]: data.images }))
      setShowImageModalFor(null)
      showToast(`Generated ${data.images?.length || 4} images!`, 'success')
    } catch (e) {
      showToast('Error generating images. Please try again.', 'error')
    } finally {
      setIsGeneratingImages(false)
    }
  }

  return (
    <div className="min-h-screen text-zinc-100 flex flex-col overflow-x-hidden">
      {/* Global ambient orbs for whole-page premium depth - enhanced with more layers and soft glowing accents for striking modern feel (still very subtle, non-distracting) */}
      <div className="fixed inset-0 -z-20 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] right-[20%] w-[700px] h-[700px] bg-violet-500/7 rounded-full blur-[190px] animate-[heroBlob_38s_infinite_ease-in-out]"></div>
        <div className="absolute bottom-[25%] left-[15%] w-[580px] h-[580px] bg-indigo-500/6 rounded-full blur-[160px] animate-[heroBlob_45s_infinite_ease-in-out_12s]"></div>
        <div className="absolute top-[55%] right-[30%] w-[400px] h-[400px] bg-violet-400/5 rounded-full blur-[220px] animate-[heroBlob_52s_infinite_ease-in-out_8s]"></div>
        {/* Soft global glowing accent for extra premium depth */}
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[1100px] h-[400px] bg-violet-500/4 rounded-full blur-[250px] animate-[softGlow_20s_infinite_ease-in-out]"></div>
      </div>

      {/* Navbar - Slightly more premium with enhanced glass */}
      <nav className="border-b border-white/10 bg-zinc-950/85 backdrop-blur-2xl sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Premium ThreadForge Logo - modern violet/indigo with subtle thread/AI motif */}
            <div className="flex items-center gap-3">
              <svg width="40" height="40" viewBox="0 0 40 40" className="flex-shrink-0" aria-label="ThreadForge logo">
                <defs>
                  <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="threadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f4f4f5" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#e0e7ff" stopOpacity="0.7" />
                  </linearGradient>
                  <filter id="logoGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
                  </filter>
                </defs>
                {/* New premium logo icon: modern with thread + spark element, violet theme */}
                <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#logoGrad)" opacity="0.9" />
                {/* Inner dark for contrast */}
                <rect x="5" y="5" width="30" height="30" rx="7" fill="#0a0a0c" />
                {/* Thread element: interwoven lines suggesting threads */}
                <path d="M10 12 Q15 10 20 13 Q25 10 30 12" stroke="#e0e7ff" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.85" />
                <path d="M10 18 Q15 20 20 17 Q25 20 30 18" stroke="#e0e7ff" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.75" />
                <path d="M12 25 Q17 23 22 26 Q27 23 30 25" stroke="#e0e7ff" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.8" />
                {/* Spark element: modern star/burst with glow, violet theme */}
                <g filter="url(#logoGlow)">
                  <polygon points="20,8 22,14 28,14 23,18 25,24 20,20 15,24 17,18 12,14 18,14" fill="#a78bfa" opacity="0.95" />
                  <circle cx="20" cy="16" r="2.5" fill="#fff" opacity="0.7" />
                </g>
                <circle cx="11" cy="10" r="1.8" fill="#a5b4fc" />
                <circle cx="25" cy="10" r="1.8" fill="#a5b4fc" />
                <circle cx="18" cy="24" r="2.2" fill="#6366f1" />
                <line x1="11" y1="10" x2="18" y2="24" stroke="#a5b4fc" strokeWidth="0.9" opacity="0.65" />
                <line x1="25" y1="10" x2="18" y2="24" stroke="#a5b4fc" strokeWidth="0.9" opacity="0.65" />
                <line x1="11" y1="10" x2="25" y2="10" stroke="#a5b4fc" strokeWidth="0.7" opacity="0.5" />
              </svg>
              <div className="font-semibold text-2xl tracking-tighter">ThreadForge</div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <a href="#how" className="text-zinc-400 hover:text-white transition-colors">How it works</a>
            <a href="#use-cases" className="text-zinc-400 hover:text-white transition-colors">Use cases</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a>
            {isSignedIn && hasPro && (
              <a href="/history" className="text-zinc-400 hover:text-white transition-colors pro-sparkle">History</a>
            )}
            
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
            <div className="md:hidden border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl px-6 py-4 flex flex-col gap-3 text-sm">
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
              {isSignedIn && hasPro && (
                <a 
                  href="/history" 
                  className="text-zinc-400 hover:text-white py-1 pro-sparkle"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  History
                </a>
              )}
              
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
                        className="px-5 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-full font-semibold text-sm transition-all text-center hover:shadow-[0_0_15px_rgba(167,139,250,0.4)]"
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
      <div className="bg-zinc-900/70 border-b border-white/10 backdrop-blur-md">
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

      {/* Hero - Stronger, more dynamic and premium */}
      <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        
        {/* Rich, more dynamic dark background with subtle glowing orbs + faint grid for premium life and depth */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {/* Deep rich base atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/85 via-zinc-950/50 to-zinc-950/95"></div>
          {/* Faint grid for modern texture and depth */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(39,39,42,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.12)_1px,transparent_1px)] bg-[length:32px_32px] opacity-50"></div>
          {/* Radial dot grid overlay for extra life */}
          <div className="absolute inset-0 bg-[radial-gradient(#27272a_0.8px,transparent_1.2px)] bg-[length:5px_5px] opacity-40"></div>
          {/* Soft gradient mesh */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/50 via-transparent to-indigo-950/40"></div>
          {/* Vignette for focus and depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.3)_100%)]"></div>
          
          {/* Rich, modern dark tech background for hero: deep violet/indigo gradients, soft glowing orbs, very subtle geometric grid - applied directly here for the main hero section to ensure it shows (not flat black) */}
          {/* Deep rich base atmosphere with layered violet/indigo gradients for depth */}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/80 via-zinc-950/40 to-zinc-950/90"></div>
          {/* Very subtle geometric grid pattern (lines + dots) for modern tech texture - kept very faint */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(39,39,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(39,39,42,0.06)_1px,transparent_1px)] bg-[length:36px_36px]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(#27272a_0.5px,transparent_2px)] bg-[length:6px_6px] opacity-30"></div>
          {/* Soft gradient mesh for premium atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/55 via-transparent to-indigo-950/45"></div>
          {/* Vignette for focus and depth */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.35)_100%)]"></div>
          
          {/* Soft glowing orbs - more numerous, varied for rich, alive premium feel (deep violet/indigo, slow animations, non-distracting) */}
          <div className="absolute top-1/4 left-1/3 w-[520px] h-[520px] bg-violet-500/22 rounded-full blur-[180px] animate-[heroBlob_26s_infinite_ease-in-out]"></div>
          <div className="absolute bottom-1/3 right-1/4 w-[460px] h-[460px] bg-indigo-500/18 rounded-full blur-[150px] animate-[heroBlob_32s_infinite_ease-in-out_5s]"></div>
          <div className="absolute top-2/3 left-1/5 w-80 h-80 bg-violet-400/14 rounded-full blur-[120px] animate-[heroBlob_20s_infinite_ease-in-out_9s]"></div>
          <div className="absolute top-[38%] right-[12%] w-[340px] h-[340px] bg-indigo-400/12 rounded-full blur-[200px] animate-[heroBlob_38s_infinite_ease-in-out_2s]"></div>
          <div className="absolute bottom-[12%] left-[8%] w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[220px] animate-[heroBlob_50s_infinite_ease-in-out_14s]"></div>
          <div className="absolute top-[18%] right-[35%] w-[280px] h-[280px] bg-violet-500/9 rounded-full blur-[160px] animate-[heroBlob_29s_infinite_ease-in-out_7s]"></div>
          <div className="absolute top-[50%] left-[25%] w-[200px] h-[200px] bg-indigo-500/8 rounded-full blur-[130px] animate-[heroBlob_42s_infinite_ease-in-out_4s]"></div>
          <div className="absolute top-[62%] right-[22%] w-[380px] h-[380px] bg-violet-500/11 rounded-full blur-[175px] animate-[heroBlob_35s_infinite_ease-in-out_11s]"></div>
          
          {/* Soft glowing accents - prominent layered glows for premium alive hero (behind headline and generator) */}
          <div className="absolute top-[26%] left-1/2 -translate-x-1/2 w-[980px] h-[320px] bg-violet-500/10 rounded-full blur-[140px] animate-[softGlow_15s_infinite_ease-in-out]"></div>
          <div className="absolute top-[33%] left-1/2 -translate-x-1/2 w-[760px] h-[240px] bg-indigo-500/9 rounded-full blur-[120px] animate-[softGlow_21s_infinite_ease-in-out_3s]"></div>
          <div className="absolute top-[42%] left-1/2 -translate-x-1/2 w-[620px] h-[180px] bg-violet-400/7 rounded-full blur-[100px] animate-[softGlow_17s_infinite_ease-in-out_1s]"></div>
          <div className="absolute top-[48%] left-1/2 -translate-x-1/2 w-[450px] h-[140px] bg-indigo-400/6 rounded-full blur-[85px] animate-[softGlow_24s_infinite_ease-in-out_6s]"></div>
          <div className="absolute top-[55%] left-1/2 -translate-x-1/2 w-[550px] h-[160px] bg-violet-500/5 rounded-full blur-[95px] animate-[softGlow_19s_infinite_ease-in-out_8s]"></div>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full text-sm mb-8 text-zinc-300 animate-[fadeInUp_0.5s_ease-out] hover:border-violet-500/50 hover:shadow-[0_0_28px_rgba(167,139,250,0.45)] transition-all">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></span>
          Built for creators and founders who actually post
        </div>

        <h1 className="text-6xl md:text-7xl lg:text-[78px] font-semibold tracking-[-4.8px] mb-8 leading-[0.9] animate-[fadeInUp_0.6s_ease-out_0.1s_both] [text-shadow:0_2px_12px_rgba(0,0,0,0.5),0_0_25px_rgba(124,58,237,0.2),0_0_40px_rgba(124,58,237,0.1)]">
          Stop staring at a blank<br />screen. Post on X in seconds.
        </h1>
        
        <p className="text-xl md:text-[21px] text-zinc-400 max-w-[620px] mx-auto mb-12 leading-tight animate-[fadeInUp_0.6s_ease-out_0.25s_both]">
          Turn any idea into 4 high-quality, ready-to-post X threads — instantly.<br className="hidden md:block" />
          Built for founders, creators, and anyone who wants to post consistently without the headache.
        </p>

        {/* Generator - wrapped in premium glass container for strong visual depth and focal impact (cleaner now without redundant preview) */}
        <div className="max-w-2xl mx-auto">
          <div className="glass-card bg-zinc-900/55 backdrop-blur-[32px] border border-white/30 rounded-3xl p-7 md:p-9 shadow-[0_28px_40px_-12px_rgb(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1),0_0_35px_rgba(124,58,237,0.15),inset_0_2px_3px_rgba(255,255,255,0.06),inset_0_-1px_2px_rgba(0,0,0,0.2)] hover:shadow-[0_40px_55px_-15px_rgb(0,0,0,0.55),0_0_0_1px_rgba(167,139,250,0.3),0_0_50px_rgba(124,58,237,0.22),inset_0_2px_3px_rgba(255,255,255,0.08)] hover:border-violet-400/40 transition-all">
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
              className="flex-1 bg-zinc-950/55 border border-white/10 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/50 focus:shadow-[0_0_0_4px_rgba(124,58,237,0.15),0_0_15px_rgba(124,58,237,0.2)] rounded-2xl px-6 py-4 text-lg placeholder:text-zinc-500 focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className="px-8 py-4 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 active:from-violet-700 active:to-indigo-700 text-white font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-2 min-w-[180px] shadow-[0_4px_15px_-2px_rgba(0,0,0,0.3)] hover:shadow-[0_0_40px_rgba(167,139,250,0.65),0_10px_25px_-4px_rgba(0,0,0,0.3)] hover:shadow-xl"
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

          {/* Visible usage counter / priority indicator */}
          {isSignedIn && hasPro ? (
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 px-3 py-1 text-xs text-violet-300 pro-sparkle">
                <span className="text-violet-400">★</span>
                Pro: unlimited generations • Priority enabled
              </span>
            </div>
          ) : isSignedIn && !hasPro ? (
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 border border-white/10 px-3 py-1 text-xs text-zinc-400">
                <span className="text-emerald-400">●</span>
                {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} free generations left today
              </span>
            </div>
          ) : null}

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
                    className="text-sm px-4 py-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-violet-500/60 hover:shadow-[0_0_22px_rgba(167,139,250,0.45)] text-zinc-300 hover:text-white transition-all active:scale-[0.985] disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-500 mt-4">
            {isSignedIn && hasPro ? (
              "Pro: unlimited generations"
            ) : isSignedIn ? (
              `${Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / ${MAX_FREE_GENERATIONS} free generations left today`
            ) : (
              <>
                Press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-[10px] font-mono">⌘+Enter</kbd> • Free tier: 3/day
              </>
            )}
          </p>
          </div>
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

      {/* Your Generated Threads */}
      {threads.length > 0 && (
        <div ref={resultsRef} className="max-w-4xl mx-auto px-6 pb-20">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-y-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Your Generated Threads</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Copy All = full thread to clipboard. Post to X opens composer (Pro). Hover tweets for Copy Tweet or ✨ Emojis & hashtags.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setThreads([])
                  setTopic('')
                  setDemoMode(false)
                  setThreadImages({})
                  setShowImageModalFor(null)
                  setTimeout(() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    input?.focus()
                  }, 50)
                }}
                className="text-sm px-5 py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all"
              >
                New topic
              </button>
              {hasPro && (
                <a href="/history" className="text-sm px-5 py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all pro-sparkle">
                  View History
                </a>
              )}
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyThread(thread)}
                      title="Copy the entire thread (all tweets) to your clipboard"
                      className="copy-button flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                    >
                      <CopyIcon />
                      <span>{copiedThreadId === thread.id ? 'Copied!' : 'Copy All'}</span>
                    </button>
                    {hasPro && (
                      <button
                        onClick={() => copyToX(thread)}
                        title="Copy the full thread and open X's compose window (Pro)"
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                      >
                        <XIcon />
                        Post to X
                      </button>
                    )}
                    {hasPro && (
                      <button
                        onClick={() => {
                          setShowImageModalFor(thread.id)
                          setSelectedImageStyle('auto')
                          setSelectedImageCount(4)
                        }}
                        title="Generate 1-4 relevant AI images for this thread (Pro)"
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                      >
                        ✨ Generate Images
                      </button>
                    )}
                  </div>
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
                          title="Copy just this single tweet"
                          className="opacity-0 group-hover:opacity-100 text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-lg self-start mt-0.5 transition-all text-zinc-400 hover:text-white flex items-center gap-1.5"
                        >
                          {isCopied ? (
                            <span className="text-emerald-400 font-medium">Copied!</span>
                          ) : (
                            <>
                              <span>Copy Tweet</span>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
                              </svg>
                            </>
                          )}
                        </button>
                        {hasPro && (
                          <button
                            onClick={() => suggestForTweet(thread.id, i, tweet)}
                            disabled={suggestLoading[`${thread.id}-${i}`]}
                            title="Get Emojis & Hashtags for this tweet (Pro)"
                            className="opacity-0 group-hover:opacity-100 text-xs px-3 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded-lg self-start mt-0.5 transition-all disabled:opacity-50"
                          >
                            {suggestLoading[`${thread.id}-${i}`] ? '...' : '✨ Emojis'}
                          </button>
                        )}
                        {suggestions[`${thread.id}-${i}`] && (
                          <div className="text-xs text-violet-300 mt-1 pl-8">
                            Emojis: {suggestions[`${thread.id}-${i}`].emojis.join(' ')} &nbsp;&nbsp; Hashtags: {suggestions[`${thread.id}-${i}`].hashtags.join(' ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Image choice panel (shown when Generate Images clicked for this thread) */}
                {showImageModalFor === thread.id && (
                  <div className="mt-4 p-4 bg-zinc-900/70 border border-white/10 rounded-2xl">
                    <div className="text-xs font-medium text-violet-400 mb-2 tracking-[1.5px]">CHOOSE STYLE &amp; COUNT (Pro)</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {IMAGE_STYLES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSelectedImageStyle(s)}
                          className={`text-xs px-3 py-1 rounded-full border transition-all ${selectedImageStyle === s ? 'bg-violet-500 text-white border-violet-500' : 'bg-zinc-800 border-white/10 hover:border-violet-400/50'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs font-medium text-violet-400 mb-1 tracking-[1.5px]">Number of images:</div>
                    <div className="flex gap-2 mb-3">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSelectedImageCount(n)}
                          className={`text-xs px-3 py-1 rounded border transition-all ${selectedImageCount === n ? 'bg-violet-500 border-violet-500 text-white' : 'bg-zinc-800 border-white/10'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateImages(thread)}
                        disabled={isGeneratingImages}
                        className="text-sm px-4 py-2 bg-violet-500 hover:bg-violet-600 rounded-2xl text-white disabled:opacity-50 transition-all"
                      >
                        {isGeneratingImages ? 'Generating...' : 'Generate Images'}
                      </button>
                      <button
                        onClick={() => setShowImageModalFor(null)}
                        className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { setSelectedImageStyle('auto'); setSelectedImageCount(4); }}
                        className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all"
                      >
                        Auto (4 images)
                      </button>
                    </div>
                  </div>
                )}

                {/* Display generated images for this thread */}
                {hasPro && threadImages[thread.id]?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-violet-400 tracking-[1.5px]">IMAGES FOR THIS THREAD — {threadImages[thread.id][0]?.style}</div>
                      <button onClick={() => { setShowImageModalFor(thread.id); setSelectedImageStyle('auto'); setSelectedImageCount(4); }} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Regenerate</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {threadImages[thread.id].map((img, idx) => (
                        <div key={idx} className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/50">
                          <img
                            src={img.url}
                            alt={`Visual ${idx + 1} for ${thread.title}`}
                            className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => downloadImage(img.url, `thread-${thread.id}-${img.style}-${idx + 1}.jpg`)}
                              className="text-[10px] px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white transition-colors"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => copyImageToClipboard(img.url)}
                              className="text-[10px] px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Free usage limit is enforced in handleGenerate */}
        </div>
      )}

      {/* How it Works - premium icons + hover effects */}
      <div id="how" className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-800">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold tracking-tight mb-3 animate-[fadeInUp_0.5s_ease-out]">From idea to posted thread in seconds</h2>
          <p className="text-zinc-400">No more overthinking. No more blank page anxiety.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { 
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              ),
              title: "Type one sentence", 
              desc: "Just describe what you want to talk about — a lesson, launch, opinion, or story." 
            },
            { 
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              ),
              title: "Get 4 strong threads", 
              desc: "We generate four different angles: contrarian, personal story, framework, and bold opinion." 
            },
            { 
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ),
              title: "Copy and post", 
              desc: "Each thread is ready to copy. Post the best one or use all four throughout the week." 
            }
          ].map((item, index) => (
            <div key={index} className="glass-card bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
              <div className="how-icon w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center font-semibold mb-4">
                {item.icon}
              </div>
              <div className="font-semibold text-lg mb-2 tracking-tight">{item.title}</div>
              <div className="text-zinc-400 text-[15px] leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-World Use Cases - icons + premium hover cards */}
      <div id="use-cases" className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-800">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold tracking-tight mb-3 animate-[fadeInUp_0.5s_ease-out]">Real situations where people use ThreadForge</h2>
          <p className="text-zinc-400 max-w-md mx-auto">Stop overthinking what to post. Here are actual scenarios where this saves people serious time.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
              title: "You're launching a product or side project",
              desc: "You finally shipped something. Instead of spending 2 hours crafting a launch thread, you type a short description and get 4 strong angles ready to post."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17.687a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h4.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25H9.663z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-3.75" /></svg>,
              title: "You had a valuable lesson or failure",
              desc: "Something went wrong (or surprisingly well) in your business. You want to share the real story without spending an hour structuring it into a thread."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
              title: <span className="pro-sparkle">You're trying to grow on X consistently</span>,
              desc: "You know you should post more, but writing good threads takes too much mental energy. You use ThreadForge 3–4 times a week to stay consistent."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 01-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
              title: "You're building in public",
              desc: "You're documenting your journey but hate the blank page. You drop quick notes about what you're working on and turn them into proper threads."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
              title: "You're a consultant, coach, or expert",
              desc: "You want to demonstrate your thinking and attract better clients, but you don't have time to write long threads every week."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17.687a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h4.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25H9.663z" /></svg>,
              title: "You have one good idea but don't know how to expand it",
              desc: "You have a strong opinion or insight. ThreadForge turns that single idea into multiple high-quality threads from different angles (contrarian, story, framework, etc)."
            }
          ].map((useCase, index) => (
            <div key={index} className="glass-card bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center mb-4">
                {useCase.icon}
              </div>
              <div className="font-semibold text-lg mb-2 tracking-tight">{useCase.title}</div>
              <div className="text-zinc-400 text-[15px] leading-relaxed">{useCase.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials - avatars + premium cards */}
      <div className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-800">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold tracking-tight mb-3 animate-[fadeInUp_0.5s_ease-out]">Real people. Real results.</h2>
          <p className="text-zinc-400">Real feedback from people using ThreadForge</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {[
            {
              quote: "I used to spend 45+ minutes writing one thread. Now I type one sentence and get four strong versions. It’s completely changed how often I post.",
              name: "Maya Patel",
              role: "Indie hacker, $180k MRR",
              avatar: "MP"
            },
            {
              quote: "The different angles are the best part. One thread performs well, but having the contrarian + story versions means I can post multiple times from one idea.",
              name: "Alex Rivera",
              role: "Founder, building in public",
              avatar: "AR"
            },
            {
              quote: "I’m not a natural writer. ThreadForge lets me share valuable lessons from my business without it taking half my day. My engagement has gone way up.",
              name: "Jordan Kim",
              role: "SaaS founder & consultant",
              avatar: "JK"
            },
            {
              quote: "I use this almost every day when I’m documenting my journey. It turns my rough notes into proper threads that actually get traction.",
              name: "Sam Chen",
              role: "Solo founder, 42k followers",
              avatar: "SC"
            }
          ].map((testimonial, index) => (
            <div key={index} className="glass-card group bg-zinc-900/60 border border-white/10 rounded-2xl p-6">
              <p className="text-zinc-200 mb-6 leading-relaxed">“{testimonial.quote}”</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 via-indigo-500 to-violet-400 flex items-center justify-center text-[11px] font-bold text-white ring-1 ring-white/10 group-hover:ring-violet-400/40 group-hover:shadow-[0_0_10px_rgba(167,139,250,0.3)] transition-all">
                  {testimonial.avatar}
                </div>
                <div>
                  <div className="font-medium">{testimonial.name}</div>
                  <div className="text-sm text-zinc-400">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing - Option B: Free vs Pro comparison cards with cancel anytime */}
      <div id="pricing" className="max-w-5xl mx-auto px-6 py-20 border-t border-zinc-800">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-4">PRICING</div>
          <h2 className="text-4xl font-semibold tracking-tighter mb-3">Free to start.<br className="hidden sm:block" /> Pro when you need it.</h2>
          <p className="text-zinc-400 max-w-md mx-auto">Generous free tier forever. Pro unlocks unlimited + premium features as we launch them.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-[860px] mx-auto">
          {/* Free Tier Card */}
          <div className="glass-card rounded-3xl border border-white/10 bg-zinc-900/60 p-8 flex flex-col">
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
          <div className="glass-card rounded-3xl border-2 border-violet-500/70 bg-zinc-900 p-8 flex flex-col relative shadow-xl">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-px text-[10px] font-semibold tracking-[1px] bg-violet-500 text-white rounded-full pro-sparkle shadow-[0_0_12px_rgba(167,139,250,0.6)]">MOST POPULAR</div>

            <div className="mb-6">
              <div className="uppercase text-violet-400 text-xs tracking-[1.5px] font-medium mb-1 flex items-center gap-2 pro-sparkle">
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
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> One-click post to X</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Smart emoji &amp; hashtag suggestions</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Early access to new AI features</li>
            </ul>

            {hasPro ? (
              <div className="mt-8">
                <div className="w-full py-4 bg-emerald-500/10 text-emerald-400 font-semibold rounded-2xl text-center text-lg border border-emerald-500/30">
                  ✓ You have Pro
                </div>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Manage subscription via Stripe Billing Portal</p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleUpgrade}
                  className="mt-8 w-full py-4 bg-white hover:bg-zinc-100 active:bg-zinc-200 transition-all text-zinc-950 font-semibold rounded-2xl text-lg shadow-sm hover:shadow-[0_0_20px_rgba(167,139,250,0.3)]"
                >
                  Upgrade to Pro — $9/mo
                </button>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Billed monthly. Cancel in seconds.</p>
              </>
            )}
          </div>
        </div>

        <p className="text-center mt-8 text-xs text-zinc-500">Pro activates instantly. History, Post to X, emoji suggestions, and priority now live for Pro users.</p>
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
