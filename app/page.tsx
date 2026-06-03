'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, SignUpButton, UserButton, useClerk } from '@clerk/nextjs'
import { IMAGE_STYLES, type ImageStyle } from './lib/prompts'

interface Thread {
  id: number
  title: string
  tweets: string[]
  images?: Array<{url: string, style: string, revisedPrompt?: string}>
}

export default function Page() {
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()
  const legacyHasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const userPlan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacyHasPro ? 'pro-plus' : null)
  const hasPro = userPlan === 'pro' || userPlan === 'pro-plus'  // Pro or Pro+
  const isProPlus = userPlan === 'pro-plus'  // Image Gen exclusive
  const hasUsedProPlusTrial = !!(user?.publicMetadata?.hasUsedProPlusTrial)
  const [showProPlusTrialBanner, setShowProPlusTrialBanner] = useState(false)

  const [topic, setTopic] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0)
  const [copiedThreadId, setCopiedThreadId] = useState<number | null>(null)
  const [copiedTweetKey, setCopiedTweetKey] = useState<string | null>(null)
  const [suggestLoading, setSuggestLoading] = useState<Record<string, boolean>>({})

  // Applied suggestions for clean automated display (emojis next to tweets, hashtags at thread bottom)
  const [threadEmojis, setThreadEmojis] = useState<Record<number, Record<number, string>>>({})
  const [threadHashtags, setThreadHashtags] = useState<Record<number, string[]>>({})

  const [toast, setToast] = useState<{ 
    message: string; 
    type: 'success' | 'error' | 'info'; 
    action?: { label: string; href?: string; onClick?: () => void } 
  } | null>(null)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Image generation states (Pro-only)
  const [showImageModalFor, setShowImageModalFor] = useState<number | null>(null)
  const [selectedImageStyle, setSelectedImageStyle] = useState<ImageStyle>('auto')
  const [selectedImageCount, setSelectedImageCount] = useState(1)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [threadImages, setThreadImages] = useState<Record<number, Array<{url: string, style: string, revisedPrompt?: string}>>>({})

  // Thread Scheduler (Pro+ only)
  const [showScheduleFor, setShowScheduleFor] = useState<number | null>(null)
  const [scheduleTime, setScheduleTime] = useState('')
  const [isScheduling, setIsScheduling] = useState(false)

  // AI Rewriter (Pro+)
  const [showRewriteFor, setShowRewriteFor] = useState<number | null>(null)
  const [rewriteMode, setRewriteMode] = useState('Punchier')
  const [rewriteCustom, setRewriteCustom] = useState('')
  const [isRewriting, setIsRewriting] = useState(false)

  // More actions dropdown per thread (for less-used actions: Save Template, Rewrite)
  const [showMoreFor, setShowMoreFor] = useState<number | null>(null)

  // Post to X Preview/Edit Modal (Pro)
  const [showPostPreviewFor, setShowPostPreviewFor] = useState<number | null>(null)
  const [previewTweets, setPreviewTweets] = useState<string[]>([])
  const [isPosting, setIsPosting] = useState(false)

  // Preview-specific image generation states (to not conflict with main panel)
  const [previewImageStyle, setPreviewImageStyle] = useState<ImageStyle>('auto')
  const [previewImageCount, setPreviewImageCount] = useState(1)
  const [isGeneratingPreviewImages, setIsGeneratingPreviewImages] = useState(false)
  const [previewImageAssignments, setPreviewImageAssignments] = useState<Record<number, number[]>>({})

  // For saving edited thread + images to history on confirm post
  const [previewTitle, setPreviewTitle] = useState('')

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

  // Consume pending template from /templates "Use Template" (localStorage handoff)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('threadforge_pending_template')
      if (raw) {
        const tpl = JSON.parse(raw)
        if (tpl?.title && Array.isArray(tpl.tweets) && tpl.tweets.length) {
          setTopic(tpl.title)
          const loadedThread: Thread = { id: 1, title: tpl.title, tweets: tpl.tweets }
          setThreads([loadedThread])
          setTimeout(() => {
            const el = document.getElementById('generator')
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 120)
          localStorage.removeItem('threadforge_pending_template')
        }
      }
    } catch {}
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

  const handleUpgrade = async (plan: 'pro' | 'pro-plus' = 'pro') => {
    if (!isSignedIn) {
      setShowAuthPrompt(true)
      return
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
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
    const tweets = Array.isArray(thread?.tweets) ? thread.tweets : []
    const fullThread = tweets.join('\n\n')
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

  // Open preview/edit modal instead of immediate post
  const copyToX = (thread: Thread) => {
    const tweets = Array.isArray(thread?.tweets) ? thread.tweets : []
    if (tweets.length === 0) return
    setPreviewTweets([...tweets]) // editable copy
    setPreviewTitle(thread.title || 'Thread')
    // Seed from embedded images on thread if present (so preview sees prior attachments)
    if (thread.images && thread.images.length > 0) {
      setThreadImages(prev => ({ ...prev, [thread.id]: thread.images! }))
    }
    setPreviewImageAssignments({})
    setPreviewImageStyle('auto')
    setPreviewImageCount(1)
    setShowPostPreviewFor(thread.id)
  }

  // Actual post logic (used by confirm in preview modal)
  const performPostToX = async (
    tweetsToPost: string[],
    imagePool: Array<{url: string, style: string, revisedPrompt?: string}> = [],
    mediaAssignments: Record<number, number[]> = {},
    titleForHistory?: string
  ) => {
    if (tweetsToPost.length === 0) return

    setIsPosting(true)
    try {
      console.log('[performPostToX] Sending to /api/x/post - image data:', {
        tweetsToPost,
        imagePoolCount: imagePool.length,
        mediaAssignments,
        title: titleForHistory
      })
      const res = await fetch('/api/x/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweets: tweetsToPost,
          images: imagePool,
          mediaAssignments, // e.g. { "0": [2], "1": [0] } => tweet 0 gets images[2], tweet 1 gets images[0]
          title: titleForHistory || previewTitle || 'Thread',
          topic: topic || 'Posted thread'
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.requireConnect) {
          showToast('To post directly to X, first connect your X account (free) from the Scheduler page.', 'info')
        } else if (data.requireUpgrade) {
          showToast('Direct posting to X requires a Pro subscription. Upgrade to unlock.', 'info')
        } else if (data.creditsDepleted) {
          showToast(
            'X API credits depleted. Add credits in your X Developer Console to post again.',
            'error',
            { label: 'Add X Credits', href: 'https://developer.x.com/en/portal/dashboard' }
          )
        } else {
          // User-friendly error: strip raw "X API error N: " prefix and show clean message
          let msg = data.error || 'Could not post to X right now. Please try again in a moment.'
          if (typeof msg === 'string') {
            msg = msg.replace(/^X API error \d+:\s*/i, '').replace(/\(code: \d+\)/i, '').trim()
            if (msg.length > 160) msg = msg.slice(0, 157) + '…'
            if (/rate|too many|limit/i.test(msg)) msg = 'X rate limit reached. Wait a minute and try again.'
            else if (/auth|unauthorized|token|connect/i.test(msg)) msg = 'X connection issue. Reconnect your account from Scheduler.'
            else if (/duplicate|already|posted/i.test(msg)) msg = 'Looks like this was already posted recently. Edit and try again.'
          }
          showToast(msg, 'error')
        }
        return
      }

      const firstPostId = data.postIds && data.postIds.length > 0 ? data.postIds[0] : null
      const mediaAttached = !!data.mediaAttached
      const successMsg = mediaAttached ? 'Full thread with images posted to X!' : 'Full thread posted successfully!'
      showToast(successMsg, 'success', firstPostId ? { label: 'View on X', href: `https://x.com/i/web/status/${firstPostId}` } : undefined)

      // Open the first post in X for confirmation (and action link in toast)
      if (firstPostId) {
        window.open(`https://x.com/i/web/status/${firstPostId}`, '_blank')
      }

      // Close preview on success
      setShowPostPreviewFor(null)
      setPreviewTweets([])
      setPreviewTitle('')
      setPreviewImageAssignments({})
      setPreviewImageStyle('auto')
      setPreviewImageCount(1)
    } catch (err) {
      console.error('Post to X error:', err)
      showToast('Something went wrong connecting to X. Check your connection or try again in a moment.', 'error')
    } finally {
      setIsPosting(false)
    }
  }

  async function handleGeneratePreviewImages() {
    if (showPostPreviewFor === null) return
    // Use threads state directly (avoid potential stale closure on safeThreads which is defined later)
    const origThread = threads.find((t: any) => t.id === showPostPreviewFor) || safeThreads.find(t => t.id === showPostPreviewFor)
    if (!origThread) return
    if (!isProPlus && hasUsedProPlusTrial) {
      showToast('You have used your one-time Pro+ trial for AI Images. Upgrade to unlock permanently.', 'info')
      return
    }
    setIsGeneratingPreviewImages(true)
    try {
      const res = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          threadId: showPostPreviewFor,
          title: (origThread as any).title || previewTitle || 'Thread',
          tweets: previewTweets,  // use edited preview tweets so prompt matches the preview content
          style: previewImageStyle,
          count: previewImageCount
        })
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requireUpgrade) {
          showToast('You have used your one-time Pro+ trial. Subscribe to Pro+ to unlock AI images.', 'info')
        } else if (data.rateLimited) {
          showToast(data.error || 'Please wait before generating more images.', 'info')
        } else {
          showToast(data.error || 'Failed to generate images', 'error')
        }
        return
      }
      const imgs = data.images || []
      setThreadImages(prev => ({ ...prev, [showPostPreviewFor]: imgs }))
      // Also embed images directly into the thread object so it is "saved to the current thread being edited"
      setThreads(prev => prev.map((t: any) => t.id === showPostPreviewFor ? { ...t, images: imgs } : t ))
      showToast(`Generated ${imgs.length || 4} images for preview!`, 'success')
      if (data.wasTrial) {
        showToast('Pro+ Trial used! This was your one free use of AI Images.', 'info')
        setShowProPlusTrialBanner(true)
      }
    } catch (e) {
      showToast('Error generating images for preview. Please try again.', 'error')
    } finally {
      setIsGeneratingPreviewImages(false)
    }
  }

  // Modal helpers for post preview/edit
  const updatePreviewTweet = (index: number, newText: string) => {
    const updated = [...previewTweets]
    updated[index] = newText
    setPreviewTweets(updated)
  }

  const removePreviewTweet = (index: number) => {
    if (previewTweets.length <= 1) {
      showToast('Thread must have at least 1 tweet', 'info')
      return
    }
    const updated = previewTweets.filter((_, i) => i !== index)
    // Rebuild assignments so they stay attached to the correct (shifted) tweets after removal
    const newAssignments: Record<number, number[]> = {}
    let newIdx = 0
    previewTweets.forEach((_, oldIdx) => {
      if (oldIdx === index) return
      const val = previewImageAssignments[oldIdx]
      if (val && val.length > 0) newAssignments[newIdx] = val
      newIdx++
    })
    setPreviewTweets(updated)
    setPreviewImageAssignments(newAssignments)
  }

  const movePreviewTweet = (index: number, direction: number) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= previewTweets.length) return
    const updated = [...previewTweets]
    const [item] = updated.splice(index, 1)
    updated.splice(newIndex, 0, item)
    // Keep assignment with the tweet being moved (swap assignment values for the two positions)
    const newAssignments: Record<number, number[]> = { ...previewImageAssignments }
    const valIndex = newAssignments[index]
    const valNew = newAssignments[newIndex]
    if (valIndex && valIndex.length > 0) {
      newAssignments[newIndex] = valIndex
    } else {
      delete newAssignments[newIndex]
    }
    if (valNew && valNew.length > 0) {
      newAssignments[index] = valNew
    } else {
      delete newAssignments[index]
    }
    setPreviewTweets(updated)
    setPreviewImageAssignments(newAssignments)
  }

  const addPreviewTweet = () => {
    setPreviewTweets([...previewTweets, ''])
  }

  const confirmPostFromPreview = () => {
    // filter empty + remap image assignments to the *cleaned* tweet indices (supports multiple per tweet via array)
    const cleaned: string[] = []
    const mediaAssignments: Record<number, number[]> = {}
    let cleanIdx = 0
    previewTweets.forEach((raw, oldIdx) => {
      const t = (raw || '').trim()
      if (t.length > 0) {
        cleaned.push(t)
        const a = previewImageAssignments[oldIdx]
        if (a && a.length > 0) {
          mediaAssignments[cleanIdx] = a // already number[] (supports multi)
        }
        cleanIdx++
      }
    })
    if (cleaned.length === 0) {
      showToast('No tweets to post', 'error')
      return
    }
    // Pass the image pool + which images (by pool index) are assigned to which (cleaned) tweet positions
    const imagePool = showPostPreviewFor !== null ? (threadImages[showPostPreviewFor] || []) : []
    console.log('[preview] Confirm & Post: image data being sent', {
      cleanedTweets: cleaned,
      imagePoolCount: imagePool.length,
      imagePoolSampleUrls: imagePool.slice(0,2).map((im: any) => im?.url ? im.url.substring(0,80)+'...' : null),
      mediaAssignments,
      showPostPreviewFor
    })
    performPostToX(cleaned, imagePool, mediaAssignments, previewTitle)
  }

  const cancelPostPreview = () => {
    setShowPostPreviewFor(null)
    setPreviewTweets([])
    setPreviewTitle('')
    setPreviewImageAssignments({})
    setPreviewImageStyle('auto')
    setPreviewImageCount(1)
  }

  // One-click smart enhance for entire thread (fully automated, no modal)
  const enhanceThread = async (thread: Thread) => {
    if (!hasPro) {
      showToast('✨ Enhance is a Pro feature.', 'info')
      return
    }
    const tid = thread.id
    setSuggestLoading(prev => ({ ...prev, [`${tid}-enhance`]: true }))
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: thread.title, 
          tweets: thread.tweets, 
          topic 
        })
      })
      const data = await res.json()
      if (res.ok && data.emojis && Array.isArray(data.emojis)) {
        // Auto-apply: exactly 1 emoji per tweet (from API, in order), 2-4 hashtags at end
        const emojisList: string[] = data.emojis
        const newEm: Record<number, string> = {}
        thread.tweets.forEach((_, i) => {
          const em = emojisList[i] || emojisList[i % Math.max(1, emojisList.length)] || '✨'
          newEm[i] = em
        })
        const hashtagsList: string[] = (data.hashtags || []).slice(0, 4)
        setThreadEmojis(prev => ({ ...prev, [tid]: newEm }))
        setThreadHashtags(prev => ({ ...prev, [tid]: hashtagsList }))
        showToast('Thread enhanced with natural emojis + strategic hashtags!', 'success')
      } else {
        // Use fallback which returns per-tweet
        const fb = data.emojis ? data : { emojis: thread.tweets.map((_,i) => ['✨','🚀','💡','🎯'][i%4]), hashtags: ['#x', '#buildinpublic'] }
        const newEm: Record<number, string> = {}
        thread.tweets.forEach((_, i) => {
          newEm[i] = (fb.emojis[i] || '✨')
        })
        setThreadEmojis(prev => ({ ...prev, [tid]: newEm }))
        setThreadHashtags(prev => ({ ...prev, [tid]: (fb.hashtags || []).slice(0,4) }))
        showToast('Enhanced with smart fallbacks (natural & tasteful).', 'info')
      }
    } catch (e) {
      // Hard fallback - 1 per tweet + 3 hashtags, tasteful
      const newEm: Record<number, string> = {}
      thread.tweets.forEach((t, i) => {
        const lower = (thread.title + ' ' + t).toLowerCase()
        let em = '✨'
        if (lower.includes('ai') || lower.includes('tech')) em = '🤖'
        else if (lower.includes('growth') || lower.includes('launch')) em = '🚀'
        else if (lower.includes('learn') || lower.includes('story')) em = '💡'
        else if (lower.includes('business')) em = '💰'
        newEm[i] = em
      })
      setThreadEmojis(prev => ({ ...prev, [tid]: newEm }))
      setThreadHashtags(prev => ({ ...prev, [tid]: ['#x', '#buildinpublic', '#growth'] }))
      showToast('Enhanced (offline fallback - clean & professional).', 'info')
    } finally {
      setSuggestLoading(prev => ({ ...prev, [`${tid}-enhance`]: false }))
    }
  }

  const showToast = (
    message: string, 
    type: 'success' | 'error' | 'info' = 'info', 
    action?: { label: string; href?: string; onClick?: () => void }
  ) => {
    setToast({ message, type, action })
    // Keep action toasts visible a bit longer
    setTimeout(() => {
      setToast(null)
    }, action ? 5000 : 2600)
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
    if (!isProPlus && hasUsedProPlusTrial) {
      showToast('You have used your one-time Pro+ trial for AI Images. Upgrade to unlock permanently.', 'info')
      return
    }
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
          showToast('You have used your one-time Pro+ trial. Subscribe to Pro+ to unlock AI images.', 'info')
        } else if (data.rateLimited) {
          showToast(data.error || 'Please wait before generating more images.', 'info')
        } else {
          showToast(data.error || 'Failed to generate images', 'error')
        }
        return
      }
      const imgs = data.images || []
      setThreadImages(prev => ({ ...prev, [thread.id]: imgs }))
      // Embed into thread so images are saved/attached to the thread itself (survives some reloads + saved in history when posted)
      setThreads(prev => prev.map((t: any) => t.id === thread.id ? { ...t, images: imgs } : t ))
      setShowImageModalFor(null)
      showToast(`Generated ${imgs.length || 4} images!`, 'success')
      if (data.wasTrial) {
        showToast('Pro+ Trial used! This was your one free use of AI Images.', 'info')
        setShowProPlusTrialBanner(true)
      }
    } catch (e) {
      showToast('Error generating images. Please try again.', 'error')
    } finally {
      setIsGeneratingImages(false)
    }
  }

  // Pro+ Thread Scheduler handler (full thread)
  async function handleSchedule(thread: Thread) {
    if (!isProPlus && hasUsedProPlusTrial) {
      showToast('You have used your one-time Pro+ trial for Scheduler. Subscribe to Pro+ on the homepage to unlock permanently.', 'info')
      return
    }
    if (!scheduleTime) {
      showToast('Please select a date and time.', 'error')
      return
    }
    setIsScheduling(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: thread.title,
          tweets: thread.tweets,
          scheduledFor: new Date(scheduleTime).toISOString(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requireUpgrade) {
          showToast('You have used your one-time Pro+ trial. Subscribe to Pro+ to schedule threads.', 'info')
        } else {
          showToast(data.error || 'Failed to schedule thread.', 'error')
        }
        return
      }
      showToast('Thread scheduled! View it in Scheduler.', 'success')
      if (!isProPlus) {
        showToast('Pro+ Trial used! This was your one free use of Scheduler.', 'info')
        setShowProPlusTrialBanner(true)
      }
      setShowScheduleFor(null)
      setScheduleTime('')
      // Optional: could navigate but keep user here
    } catch (e) {
      showToast('Failed to schedule. Please try again.', 'error')
    } finally {
      setIsScheduling(false)
    }
  }

  // Save current generated thread as private template (Pro+ / Pro)
  async function saveCurrentThreadAsTemplate(thread: Thread) {
    if (!hasPro) return
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: thread.title,
          tweets: thread.tweets,
          category: 'From Generator',
        }),
      })
      if (res.ok) {
        showToast('Saved to your private templates! View in Templates.', 'success')
      } else {
        const d = await res.json().catch(() => ({}))
        showToast(d.error || 'Failed to save template', 'error')
      }
    } catch {
      showToast('Could not save template right now.', 'error')
    }
  }

  const REWRITE_OPTIONS = ['Punchier', 'More Hooks', 'Shorter', 'More Controversial', 'Add storytelling', 'Professional']

  // Pro+ AI Rewriter for full thread
  async function handleRewriteThread(thread: Thread) {
    if (!isProPlus) {
      showToast('AI Rewriter is Pro+ only.', 'info')
      return
    }
    setIsRewriting(true)
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: rewriteMode,
          custom: rewriteCustom,
          thread: { title: thread.title, tweets: thread.tweets },
        }),
      })
      const data = await res.json()
      if (data.title && Array.isArray(data.tweets)) {
        // Replace in state
        setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, title: data.title, tweets: data.tweets } : t))
        showToast('Thread rewritten with Grok 4.3', 'success')
        setShowRewriteFor(null)
        setRewriteCustom('')
      } else {
        showToast('Rewrite returned no changes.', 'info')
      }
    } catch {
      showToast('Rewrite failed (demo fallback may apply).', 'error')
    } finally {
      setIsRewriting(false)
    }
  }

  // Defensive safe threads for rendering - normalizes data from API to always have tweets array etc.
  // Prevents "Cannot read '0' of undefined" and similar on generation results.
  const safeThreads: Thread[] = Array.isArray(threads)
    ? threads.map((raw: any) => ({
        id: typeof raw?.id === 'number' ? raw.id : 0,
        title: typeof raw?.title === 'string' ? raw.title : 'Untitled thread',
        tweets: Array.isArray(raw?.tweets) ? raw.tweets : [],
        images: Array.isArray(raw?.images) ? raw.images : (raw?.images || undefined),
      }))
    : [];

  // Helper: prefer images embedded on the thread object (saved/attached), fallback to parallel threadImages map
  const getThreadImages = (th: Thread | any) => (th?.images && th.images.length > 0 ? th.images : (threadImages[th?.id] || []))

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
            <a href="/community" className="text-zinc-400 hover:text-white transition-colors">Community</a>
            <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">Pricing</a>
            {isSignedIn && hasPro && (
              <a href="/history" className="text-zinc-400 hover:text-white transition-colors pro-sparkle">History</a>
            )}
            {isSignedIn && (isProPlus || !hasUsedProPlusTrial) && (
              <a href="/scheduler" className="text-violet-400 hover:text-violet-300 transition-colors">Scheduler</a>
            )}
            {isSignedIn && hasPro && (
              <a href="/templates" className="text-emerald-400 hover:text-emerald-300 transition-colors">Templates</a>
            )}
            {isSignedIn && isProPlus && (
              <a href="/analytics" className="text-amber-400 hover:text-amber-300 transition-colors">Analytics</a>
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
                <button 
                  onClick={() => openSignIn()}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Sign in
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
                href="/community" 
                className="text-zinc-400 hover:text-white py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                Community
              </a>
              <a 
                href="#pricing" 
                className="text-zinc-400 hover:text-white py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              {isSignedIn && hasPro && (
                <>
                  <a 
                    href="/history" 
                    className="text-zinc-400 hover:text-white py-1 pro-sparkle"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    History
                  </a>
                  {hasPro && (
                    <a 
                      href="/templates" 
                      className="text-emerald-400 hover:text-emerald-300 py-1"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Templates
                    </a>
                  )}
                </>
              )}
              {isSignedIn && (isProPlus || !hasUsedProPlusTrial) && (
                <a 
                  href="/scheduler" 
                  className="text-violet-400 hover:text-violet-300 py-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Scheduler
                </a>
              )}
              
              <div className="border-t border-white/10 pt-3 mt-1 flex flex-col gap-3">
                {isSignedIn ? (
                  <div className="flex justify-center">
                    <UserButton />
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => { openSignIn(); setMobileMenuOpen(false); }}
                      className="text-zinc-400 hover:text-white py-1 text-left"
                    >
                      Sign in
                    </button>
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

      {/* Free Tier Banner - immediately obvious for new users */}
      <div className="bg-zinc-900/70 border-b border-white/10 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-2 text-center">
          <div className="text-sm text-zinc-400">
            {isSignedIn && !hasPro ? (
              <>Free: <span className="text-white font-semibold">{Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)}/{MAX_FREE_GENERATIONS}</span> generations left today • Upgrade for unlimited</>
            ) : (
              <>Free: 3 generations per day • Pro ($9): unlimited + core tools • Pro+ ($15): + AI images + scheduler + analytics</>
            )}
            {!isSignedIn && <button onClick={() => openSignIn()} className="ml-2 underline text-violet-400 hover:text-violet-300">Sign in</button>}
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
          Instant AI threads + images for serious X creators
        </div>

        <h1 className="text-6xl md:text-7xl lg:text-[78px] font-semibold tracking-[-4.8px] mb-6 leading-[0.9] animate-[fadeInUp_0.6s_ease-out_0.1s_both] [text-shadow:0_2px_12px_rgba(0,0,0,0.5),0_0_25px_rgba(124,58,237,0.2),0_0_40px_rgba(124,58,237,0.1)]">
          Turn any idea into ready-to-post X threads + AI images — in seconds.
        </h1>
        
        <p className="text-xl md:text-[21px] text-zinc-400 max-w-[620px] mx-auto mb-4 leading-tight animate-[fadeInUp_0.6s_ease-out_0.25s_both]">
          From any idea to 4 polished threads with matching images — ready to post in seconds. No fluff. Just results.
        </p>

        <p className="text-sm text-zinc-500 mb-6 max-w-[520px] mx-auto">
          Built for creators, founders, and indie hackers who post consistently.
        </p>

        {/* Generator - wrapped in premium glass container for strong visual depth and focal impact (cleaner now without redundant preview) */}
        <div className="max-w-2xl mx-auto">
          <div className="glass-card bg-zinc-900/55 backdrop-blur-[32px] border border-white/30 rounded-3xl p-7 md:p-9 shadow-[0_28px_40px_-12px_rgb(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.1),0_0_35px_rgba(124,58,237,0.15),inset_0_2px_3px_rgba(255,255,255,0.06),inset_0_-1px_2px_rgba(0,0,0,0.2)] hover:shadow-[0_40px_55px_-15px_rgb(0,0,0,0.55),0_0_0_1px_rgba(167,139,250,0.3),0_0_50px_rgba(124,58,237,0.22),inset_0_2px_3px_rgba(255,255,255,0.08)] hover:border-violet-400/40 transition-all">
          {/* Subtle 1-2 line onboarding guidance for first-time users (generator area) */}
          <div className="text-center mb-3">
            <p className="text-[11px] text-zinc-400">Start by typing any idea above. You get 3 free generations per day — upgrade anytime for unlimited.</p>
          </div>
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
              className="group px-10 py-4 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 active:from-violet-700 active:to-indigo-700 text-white font-semibold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap flex items-center justify-center gap-3 min-w-[220px] text-[15px] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.35)] hover:shadow-[0_0_60px_rgba(167,139,250,0.8),0_15px_35px_-4px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.985] ring-1 ring-violet-400/30"
            >
              {isGenerating ? (
                <>
                  <Spinner />
                  <span>Generating...</span>
                </>
              ) : (
                <>Start Generating <span className="group-hover:translate-x-1 transition text-lg">→</span></>
              )}
            </button>
          </div>

          {/* Visible usage counter / priority indicator - bigger, more prominent Pro+ badge */}
          {isSignedIn && hasPro ? (
            <div className="mt-5 text-center">
              <span className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${isProPlus 
                ? 'bg-gradient-to-r from-violet-500/25 via-indigo-500/20 to-violet-500/25 border-2 border-violet-400/70 text-violet-100 shadow-[0_0_20px_rgba(167,139,250,0.3)] pro-sparkle' 
                : 'bg-violet-500/10 border border-violet-500/40 text-violet-300'}`}>
                <span className="text-base">★</span>
                {isProPlus ? 'Pro+ Active: Unlimited + AI Images + Scheduler + Priority' : 'Pro Active: Unlimited generations • Priority enabled'}
              </span>
            </div>
          ) : isSignedIn && !hasPro ? (
            <div className="mt-5 text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-zinc-900 border border-white/10 px-4 py-1.5 text-sm text-zinc-300">
                <span className="text-emerald-400">●</span>
                {Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / {MAX_FREE_GENERATIONS} free generations left today
              </span>
            </div>
          ) : null}

          {/* One-time Pro+ Trial banner for non-Pro+ users */}
          {!isProPlus && !hasUsedProPlusTrial && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/40 px-4 py-1.5 text-xs font-medium text-amber-300">
                ✨ Pro+ Trial Available — Use AI Images or Scheduler once for free (one-time only)
              </div>
            </div>
          )}

          {/* Pro+ Trial Activated banner (shown after using in this session) */}
          {showProPlusTrialBanner && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/40 px-4 py-1.5 text-xs font-medium text-emerald-300">
                ✓ Pro+ Trial Activated — This was your one free use. Upgrade for unlimited.
              </div>
            </div>
          )}

          {/* Example topic chips - More fun & prominent */}
          {!threads.length && (
            <div className="mt-5">
              <div className="text-[10px] text-zinc-400 mb-1.5">Start by typing any idea above • Free: 3 generations/day (resets daily)</div>
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
              isProPlus ? "Pro+: unlimited + AI images + scheduler + analytics" : "Pro: unlimited generations + Post to X + History"
            ) : isSignedIn ? (
              `${Math.max(0, MAX_FREE_GENERATIONS - freeGenerationsUsed)} / ${MAX_FREE_GENERATIONS} free generations left today`
            ) : (
              <>Press Enter or click Start • Free: 3 generations/day</>
            )}
          </p>
          </div>
        </div>

        {/* Trust line below the generator */}
        <p className="text-sm text-zinc-500 mt-6 mb-4 animate-[fadeInUp_0.6s_ease-out_0.35s_both]">
          Used daily by indie hackers, SaaS founders, and creators growing on X.
        </p>
      </div>

      {/* Pro vs Pro+ Features Showcase - split cards, only visible before generating (clear tier value prop) */}
      {!threads.length && (
        <div className="max-w-5xl mx-auto px-6 py-24 border-t border-zinc-800">
          <div className="text-center mb-8">
            <div className="inline-block text-[10px] font-mono tracking-[3px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-1 rounded-full mb-3">PRO &amp; PRO+</div>
            <h2 className="text-3xl font-semibold tracking-tight mb-2 animate-[fadeInUp_0.5s_ease-out]">Pro vs Pro+</h2>
            <p className="text-zinc-400 max-w-md mx-auto">Pro for unlimited. <span className="text-cyan-400">Pro+ adds AI images + scheduler + analytics</span> <span className="text-[10px] px-1 py-px bg-cyan-500/10 text-cyan-400 rounded">Pro+</span>.</p>
          </div>

          {/* Split Pro vs Pro+ feature cards for clear tier differentiation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pro Card - clean, solid foundation */}
            <div className="premium-pricing-card premium-pro-card glass-card bg-zinc-900/60 border border-white/10 rounded-3xl p-8 flex flex-col">
              <div className="uppercase text-violet-400 text-xs tracking-[1.5px] font-semibold mb-2">PRO — $9/mo</div>
              <div className="premium-tier-title text-2xl font-semibold tracking-tight mb-4">Everything for power users</div>
              <ul className="space-y-3 text-[14px] text-zinc-200 mb-auto">
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> Unlimited generations</li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> Post to X</li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> History</li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> Smart Suggestions</li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> Priority access</li>
              </ul>
              <div className="mt-6 pt-4 border-t border-white/10 text-xs text-zinc-500">Core Pro features • No AI images or Scheduler</div>
            </div>

            {/* Pro+ Card - high-impact AI premium pop */}
            <div className="premium-pricing-card premium-pro-plus-card glass-card bg-zinc-900/70 border-2 border-violet-500/60 rounded-3xl p-8 flex flex-col relative">
              <div className="premium-badge absolute -top-3 right-6 px-4 py-px text-[10px] font-mono tracking-[1.5px] rounded-full shadow-[0_0_16px_rgba(167,139,250,0.6)]">MOST POPULAR</div>
              
              <div className="uppercase text-cyan-400 text-xs tracking-[1.5px] font-semibold mb-2 flex items-center gap-2">PRO+ — $15/mo <span className="text-[9px] px-1.5 py-px bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">IMAGES + SCHEDULER + ANALYTICS</span></div>
              
              <div className="premium-tier-title text-2xl font-semibold tracking-[-0.5px] mb-4 text-white">Pro + AI Images + Scheduler + Analytics (Pro+ only)</div>
              
              <ul className="space-y-3.5 text-[14px] text-zinc-200 mb-auto">
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-violet-400">•</span> <strong>Everything in Pro</strong></li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-cyan-400">•</span> <strong><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/><line x1="19" y1="3" x2="19" y2="7"/><line x1="17" y1="5" x2="21" y2="5"/></svg> AI Image Generation</strong> <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">Pro+</span></li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-cyan-400">•</span> <strong><span className="scheduler-modern"><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="17" cy="16" r="3"/><path d="M17 13v3h2"/></svg> Thread Scheduler</span></strong> <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">Pro+</span></li>
                <li className="premium-feature flex items-start gap-3"><span className="mt-1 text-cyan-400">•</span> <strong><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="4" height="10" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/><circle cx="6" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="18" cy="2" r="1" fill="currentColor"/></svg> Analytics &amp; Insights</strong> <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">Pro+</span></li>
              </ul>
              <div className="mt-6 pt-4 border-t border-white/10 text-xs text-zinc-500">Best for creators who want visuals + auto-posting</div>
            </div>
          </div>

          <div className="text-center mt-8">
            <a href="#pricing" className="text-sm font-medium inline-flex items-center gap-1.5 text-violet-400 hover:text-cyan-400 transition-all pro-sparkle">
              See full Pro / Pro+ pricing &amp; upgrade <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      )}

      {/* Demo Mode Notice - only visible in development */}
      {demoMode && threads.length > 0 && process.env.NODE_ENV === 'development' && (
        <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 md:px-6 mb-4">
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs px-3 py-1.5 rounded-2xl text-center">
            Demo mode active (no real AI calls).
          </div>
        </div>
      )}

      {/* Your Generated Threads */}
      {safeThreads.length > 0 && (
        <div ref={resultsRef} className="max-w-5xl lg:max-w-6xl mx-auto px-4 md:px-6 pb-20">
          <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-y-2 sm:gap-y-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Your Generated Threads</h2>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">Copy • Post (Pro) • Schedule (Pro+) • Tap to copy</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setThreads([])
                  setTopic('')
                  setDemoMode(false)
                  setThreadImages({})
                  setShowImageModalFor(null)
                  setShowScheduleFor(null)
                  setScheduleTime('')
                  setIsScheduling(false)
                  setTimeout(() => {
                    const input = document.querySelector('input[type="text"]') as HTMLInputElement
                    input?.focus()
                  }, 50)
                }}
                className="text-xs sm:text-sm md:text-sm px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all"
              >
                New topic
              </button>
              {hasPro && (
                <a href="/history" className="text-xs sm:text-sm md:text-sm px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-2xl border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all pro-sparkle">
                  View History
                </a>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {safeThreads.map((thread) => ( <div key={thread.id} className="bg-zinc-900/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 sm:p-6 md:p-6 thread-card hover:border-white/20 hover:bg-zinc-900/90 transition-all group shadow-xl max-w-full overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-5 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-violet-400 tracking-[1.5px] mb-1">THREAD {thread.id}</div>
                    <div className="thread-title font-semibold text-[17px] sm:text-[21px] leading-tight pr-2 sm:pr-4">{thread.title}</div>
                  </div>
                  <div className="relative">
                    <div className="flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2 md:gap-2.5">
                      <button
                        onClick={() => copyThread(thread)}
                        title="Copy the entire thread (all tweets) to your clipboard"
                        className="copy-button flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                      >
                        <CopyIcon />
                        <span>{copiedThreadId === thread.id ? 'Copied!' : 'Copy All'}</span>
                      </button>
                      {hasPro && (
                        <button
                          onClick={() => enhanceThread(thread)}
                          disabled={suggestLoading[`${thread.id}-enhance`]}
                          title="One-click smart enhance: auto-add 1 natural emoji per tweet + 2-4 strategic hashtags (Pro)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                        >
                          ✨ Enhance
                        </button>
                      )}
                      {hasPro && (
                        <button
                          onClick={() => copyToX(thread)}
                          title="Post full thread to X as reply chain (Pro)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                        >
                          <XIcon />
                          Post to X
                        </button>
                      )}
                      {isProPlus ? (
                        <button
                          onClick={() => {
                            setShowMoreFor(null)
                            setShowImageModalFor(thread.id)
                            setSelectedImageStyle('auto')
                            setSelectedImageCount(1)
                          }}
                          title="Generate 1-4 relevant AI images for this thread (Pro+)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                        >
                          ✨ Generate Images
                        </button>
                      ) : !hasUsedProPlusTrial ? (
                        <button
                          onClick={() => {
                            setShowMoreFor(null)
                            setShowImageModalFor(thread.id)
                            setSelectedImageStyle('auto')
                            setSelectedImageCount(1)
                          }}
                          title="Try AI Images once for free (one-time Pro+ trial)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/40 rounded-2xl transition-all active:scale-[0.985]"
                        >
                          ✨ Try Pro+ Images (1-time)
                        </button>
                      ) : hasPro ? (
                        <a
                          href="#pricing"
                          title="Image Generation requires Pro+ (trial used)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold bg-zinc-800 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/30 rounded-2xl transition-all"
                        >
                          Upgrade to Pro+ for AI Images
                        </a>
                      ) : null}

                      {/* Scheduler (Pro+ exclusive) */}
                      {isProPlus ? (
                        <button
                          onClick={() => {
                            setShowMoreFor(null)
                            setShowScheduleFor(thread.id)
                            setScheduleTime('')
                          }}
                          title="Schedule this full thread to post automatically to X (Pro+)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                        >
                          📅 Schedule
                        </button>
                      ) : !hasUsedProPlusTrial ? (
                        <button
                          onClick={() => {
                            setShowMoreFor(null)
                            setShowScheduleFor(thread.id)
                            setScheduleTime('')
                          }}
                          title="Try Scheduler once for free (one-time Pro+ trial)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold bg-zinc-800 hover:bg-amber-500/20 hover:text-amber-300 border border-amber-500/40 rounded-2xl transition-all active:scale-[0.985]"
                        >
                          📅 Try Pro+ Scheduler (1-time)
                        </button>
                      ) : hasPro ? (
                        <a
                          href="#pricing"
                          title="Thread Scheduler requires Pro+ (trial used)"
                          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold bg-zinc-800 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/30 rounded-2xl transition-all"
                        >
                          Schedule (Pro+)
                        </a>
                      ) : null}

                      {/* More dropdown (Save Template + Rewrite) - small, keeps main 5 clean */}
                      {(hasPro || isProPlus) && (
                        <button
                          onClick={() => setShowMoreFor(showMoreFor === thread.id ? null : thread.id)}
                          title="More actions (Save Template, Rewrite)"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium bg-zinc-800/70 hover:bg-white/10 border border-white/10 rounded-2xl transition-all"
                        >
                          ⋯ More
                        </button>
                      )}
                    </div>

                    {/* Premium More dropdown menu */}
                    {showMoreFor === thread.id && (
                      <div className="absolute right-0 top-full mt-1 z-30 w-44 glass-card border border-white/10 rounded-2xl py-1 shadow-2xl text-xs">
                        {hasPro && (
                          <button
                            onClick={() => { saveCurrentThreadAsTemplate(thread); setShowMoreFor(null); }}
                            className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2 text-emerald-400"
                          >
                            Save Template
                          </button>
                        )}
                        {isProPlus && (
                          <button
                            onClick={() => { setShowRewriteFor(thread.id); setRewriteMode('Punchier'); setRewriteCustom(''); setShowMoreFor(null); }}
                            className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2 text-violet-300"
                          >
                            ✎ Rewrite with AI
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Image choice panel (shown when Generate Images clicked for this thread) - moved near top */}
                {(isProPlus || !hasUsedProPlusTrial) && showImageModalFor === thread.id && (
                  <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-zinc-900/70 border border-white/10 rounded-2xl">
                    <div className="text-[10px] sm:text-xs font-medium text-violet-400 mb-1.5 sm:mb-2 tracking-[1.5px]">CHOOSE STYLE &amp; COUNT (Pro+ or one-time trial)</div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                      {IMAGE_STYLES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSelectedImageStyle(s)}
                          className={`text-[10px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border transition-all ${selectedImageStyle === s ? 'bg-violet-500 text-white border-violet-500' : 'bg-zinc-800 border-white/10 hover:border-violet-400/50'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] sm:text-xs font-medium text-violet-400 mb-1 tracking-[1.5px]">Number of images:</div>
                    <div className="flex gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSelectedImageCount(n)}
                          className={`text-[10px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded border transition-all ${selectedImageCount === n ? 'bg-violet-500 border-violet-500 text-white' : 'bg-zinc-800 border-white/10'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <button
                        onClick={() => handleGenerateImages(thread)}
                        disabled={isGeneratingImages}
                        className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-violet-500 hover:bg-violet-600 rounded-2xl text-white disabled:opacity-50 transition-all"
                      >
                        {isGeneratingImages ? 'Generating...' : 'Generate Images'}
                      </button>
                      <button
                        onClick={() => setShowImageModalFor(null)}
                        className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { setSelectedImageStyle('auto'); setSelectedImageCount(1); }}
                        className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all"
                      >
                        Auto (1 image)
                      </button>
                    </div>
                  </div>
                )}

                {/* Schedule picker (Pro+ only) - appears when Schedule clicked */}
                {(isProPlus || !hasUsedProPlusTrial) && showScheduleFor === thread.id && (
                  <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-zinc-900/70 border border-white/10 rounded-2xl">
                    <div className="text-[10px] sm:text-xs font-medium text-violet-400 mb-1.5 sm:mb-2 tracking-[1.5px]">SCHEDULE THREAD TO POST AUTOMATICALLY (Pro+ or one-time trial)</div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <input
                        type="datetime-local"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        min={new Date(Date.now() + 2 * 60 * 1000).toISOString().slice(0, 16)}
                        className="bg-zinc-950 border border-white/10 focus:border-violet-500/60 rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm outline-none min-w-[160px]"
                      />
                      <button
                        onClick={() => handleSchedule(thread)}
                        disabled={!scheduleTime || isScheduling}
                        className="px-3 sm:px-5 py-1.5 sm:py-2 rounded-2xl bg-violet-500 hover:bg-violet-600 disabled:opacity-60 text-xs sm:text-sm font-semibold text-white transition"
                      >
                        {isScheduling ? 'Scheduling...' : 'Confirm Schedule'}
                      </button>
                      <button
                        onClick={() => { setShowScheduleFor(null); setScheduleTime('') }}
                        className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] text-zinc-500">
                      Full thread will be posted as a reply chain at the selected time. <a href="/scheduler" className="text-violet-400 hover:text-violet-300">Open full Scheduler →</a>
                    </div>
                  </div>
                )}

                {/* AI Rewriter panel (Pro+ only) */}
                {isProPlus && showRewriteFor === thread.id && (
                  <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-zinc-900/70 border border-white/10 rounded-2xl">
                    <div className="text-[10px] sm:text-xs font-medium text-violet-400 mb-1.5 sm:mb-2 tracking-[1.5px]">AI REWRITE THREAD (Grok 4.3) — Pro+</div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                      {REWRITE_OPTIONS.map(opt => (
                        <button key={opt} onClick={() => setRewriteMode(opt)} className={`text-[10px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border ${rewriteMode === opt ? 'bg-violet-500 border-violet-500 text-white' : 'border-white/10 hover:border-violet-400/50'}`}>{opt}</button>
                      ))}
                    </div>
                    <input value={rewriteCustom} onChange={e=>setRewriteCustom(e.target.value)} placeholder="Or custom instructions (e.g. more storytelling, add data)" className="w-full mb-2 sm:mb-3 bg-zinc-950 border border-white/10 rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm" />
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      <button onClick={() => handleRewriteThread(thread)} disabled={isRewriting} className="px-3 sm:px-5 py-1.5 sm:py-2 bg-violet-500 rounded-2xl text-xs sm:text-sm font-semibold disabled:opacity-60">{isRewriting ? 'Rewriting...' : 'Apply Rewrite'}</button>
                      <button onClick={() => setShowRewriteFor(null)} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 rounded-2xl text-xs sm:text-sm">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Display generated images for this thread - moved to top (right below title/buttons) */}
                {/* Only show when images actually generated (removed isProPlus from condition to avoid accessing [0] of undefined for Pro+ users before generating images) */}
                {getThreadImages(thread).length > 0 && (
                  <div className="mt-3 sm:mt-4">
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <div className="text-[10px] sm:text-xs font-medium text-violet-400 tracking-[1.5px]">IMAGES FOR THIS THREAD — {getThreadImages(thread)[0]?.style || ''}</div>
                      <button onClick={() => { setShowImageModalFor(thread.id); setSelectedImageStyle('auto'); setSelectedImageCount(1); }} className="text-[10px] sm:text-xs text-violet-400 hover:text-violet-300 transition-colors">Regenerate</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                      {getThreadImages(thread).map((img: any, idx: number) => (
                        <div key={idx} className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/50">
                          <img
                            src={img.url}
                            alt={`Visual ${idx + 1} for ${thread.title}`}
                            className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 sm:p-2 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => downloadImage(img.url, `thread-${thread.id}-${img.style}-${idx + 1}.jpg`)}
                              className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white transition-colors"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => copyImageToClipboard(img.url)}
                              className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 sm:space-y-3">
                  {thread.tweets.map((tweet, i) => {
                    const key = `${thread.id}-${i}`
                    const isCopied = copiedTweetKey === key
                    const appliedEmoji = threadEmojis[thread.id]?.[i]
                    return (
                      <div key={i} className="group rounded-xl hover:bg-zinc-950/60 px-2 sm:px-3 py-1.5 sm:py-2 -mx-2 sm:-mx-3 transition-colors">
                        {/* Main tweet line: always keeps proper flex row (nowrap on desktop) — emojis added naturally by ✨ Enhance */}
                        <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3">
                          <div className="text-zinc-500 font-mono text-xs sm:text-sm w-6 sm:w-8 flex-shrink-0 pt-0.5 select-none">
                            {i + 1}/
                          </div>
                          <div className="flex-1 text-[14px] sm:text-[15px] leading-relaxed text-zinc-100 min-w-0">
                            {tweet}
                            {appliedEmoji && <span className="ml-1 text-base opacity-75 align-middle">{appliedEmoji}</span>}
                          </div>
                          <button
                            onClick={() => copyTweet(thread.id, i, tweet)}
                            title="Copy just this single tweet"
                            className="opacity-0 group-hover:opacity-100 text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-lg self-start mt-0.5 transition-all text-zinc-400 hover:text-white flex items-center gap-1"
                          >
                            {isCopied ? (
                              <span className="text-emerald-400 font-medium">Copied!</span>
                            ) : (
                              <>
                                <span>Copy</span>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
                                </svg>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Hashtags applied cleanly at bottom of thread (small, premium, no layout break) */}
                  {threadHashtags[thread.id]?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10 text-[10px] sm:text-xs text-violet-400 flex flex-wrap gap-x-2 gap-y-0.5 pl-1">
                      {threadHashtags[thread.id].map((h, idx) => (
                        <span key={idx} className="hover:text-violet-300 transition-colors cursor-default">{h}</span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>

          {/* Free usage limit is enforced in handleGenerate */}
        </div>
      )}

      {/* How it Works - 5 clear steps */}
      <div id="how" className="max-w-5xl mx-auto px-6 py-24 border-t border-zinc-800">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-semibold tracking-tight mb-2 animate-[fadeInUp_0.5s_ease-out]">How ThreadForge Works</h2>
          <p className="text-zinc-400">Idea to ready-to-post threads in seconds.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { 
              num: "01",
              title: "Enter your idea", 
              desc: "Type any topic or lesson. One sentence is enough.",
              pro: false
            },
            { 
              num: "02",
              title: "Generate 4 high-quality threads", 
              desc: "Grok 4.3 creates four distinct threads with strong hooks and closers.",
              pro: false
            },
            { 
              num: "03",
              title: "Post to X (Pro) or schedule (Pro+)", 
              desc: "One click post now (Pro). Schedule auto-post (Pro+ only).",
              pro: true,
              tier: 'pro'
            },
            { 
              num: "04",
              title: "Add AI images", 
              desc: "Generate 1–4 matching visuals instantly (Pro+ exclusive).",
              pro: true,
              tier: 'pro-plus'
            },
            { 
              num: "05",
              title: "Save + get smart suggestions", 
              desc: "Auto-save history. One-click ✨ Enhance adds natural emojis + strategic hashtags (Pro).",
              pro: true,
              tier: 'pro'
            }
          ].map((step, index) => (
            <div key={index} className="glass-card bg-zinc-900/60 border border-white/10 rounded-2xl p-6 flex gap-4 group">
              <div className="how-icon w-8 h-8 flex-shrink-0 rounded-xl bg-violet-500 text-white flex items-center justify-center text-xs font-mono font-semibold tracking-tighter">
                {step.num}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[15px] tracking-tight mb-1 flex items-center gap-2">
                  {step.title}
                  {step.pro && (
                    <span className={`text-[9px] font-mono tracking-[1.5px] px-1.5 py-px rounded ${step.tier === 'pro-plus' ? 'bg-amber-500/10 text-amber-400' : 'bg-violet-500/10 text-violet-400'}`}>
                      {step.tier === 'pro-plus' ? 'PRO+' : 'PRO'}
                    </span>
                  )}
                </div>
                <div className="text-zinc-400 text-[13px] leading-snug">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-World Use Cases - icons + premium hover cards */}
      <div id="use-cases" className="max-w-5xl mx-auto px-6 py-24 border-t border-zinc-800">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-semibold tracking-tight mb-2 animate-[fadeInUp_0.5s_ease-out]">Real ways people use ThreadForge</h2>
          <p className="text-zinc-400">Scenarios where it saves serious time.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
              title: "Launching a product or side project",
              desc: "Shipped something? Type one sentence. Get 4 strong launch threads instantly."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17.687a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h4.5a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25H9.663z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-3.75" /></svg>,
              title: "Sharing a lesson or failure",
              desc: "Turn a real story or win into polished threads without hours of structuring."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
              title: "Growing on X consistently",
              desc: "Post 3-4x a week without the mental load. Perfect for busy creators."
            },
            {
              icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 01-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
              title: "Building in public",
              desc: "Turn quick notes into professional threads that document your journey."
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

      {/* Pricing - 3-Tier: Free / Pro ($9) / Pro+ ($15) with Image Gen Pro+ only */}
      <div id="pricing" className="max-w-5xl mx-auto px-6 py-24 border-t border-zinc-800">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-3">PRICING</div>
          <h2 className="text-4xl font-semibold tracking-tighter mb-2">Free to start. Scale as you grow.</h2>
          <p className="text-zinc-400 max-w-md mx-auto">Free: 3 generations/day. Pro ($9): Unlimited generations + core tools. Pro+ ($15): Everything in Pro + AI Images + Scheduler + Analytics. Clear pricing, no surprises.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-[1100px] mx-auto">
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
              <li className="flex items-start gap-3 text-zinc-400"><span className="mt-1.5">•</span> Upgrade for unlimited + Pro / Pro+ features</li>
            </ul>

            <div className="mt-8 pt-6 border-t border-white/10 text-xs text-zinc-500 leading-snug">
              No credit card required. Upgrade anytime.
            </div>
          </div>

          {/* Pro Tier Card */}
          <div className="glass-card rounded-3xl border border-white/10 bg-zinc-900/60 p-8 flex flex-col">
            <div className="mb-6">
              <div className="uppercase text-violet-400 text-xs tracking-[1.5px] font-medium mb-1 flex items-center gap-2">
                PRO
                {hasPro && !isProPlus && <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-px rounded">ACTIVE</span>}
              </div>
              <div className="flex items-end gap-1">
                <span className="text-[52px] leading-none font-semibold tracking-[-2px]">$9</span>
                <span className="text-zinc-400 pb-1">/mo</span>
              </div>
              <div className="text-emerald-400 text-sm mt-0.5 font-medium">Cancel anytime • No long-term contract</div>
            </div>

            <ul className="space-y-[13px] text-[15px] mb-auto text-zinc-200">
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Unlimited generations</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Post to X</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> History</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Smart Suggestions</li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> Priority access</li>
            </ul>

            {hasPro && !isProPlus ? (
              <div className="mt-8">
                <div className="w-full py-4 bg-emerald-500/10 text-emerald-400 font-semibold rounded-2xl text-center text-lg border border-emerald-500/30">
                  ✓ You have Pro
                </div>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Manage via Stripe • Upgrade to Pro+ anytime</p>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleUpgrade('pro')}
                  className="mt-8 w-full py-4 bg-white hover:bg-zinc-100 active:bg-zinc-200 transition-all text-zinc-950 font-semibold rounded-2xl text-lg shadow-sm hover:shadow-[0_0_20px_rgba(167,139,250,0.3)]"
                >
                  Upgrade to Pro — $9/mo
                </button>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Billed monthly. Cancel in seconds.</p>
              </>
            )}
          </div>

          {/* Pro+ Tier Card - highlighted as Most Popular */}
          <div className="glass-card rounded-3xl border-2 border-violet-500/70 bg-zinc-900 p-8 flex flex-col relative shadow-xl">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-px text-[10px] font-semibold tracking-[1px] bg-violet-500 text-white rounded-full pro-sparkle shadow-[0_0_12px_rgba(167,139,250,0.6)]">MOST POPULAR</div>

            <div className="mb-6">
              <div className="uppercase text-violet-400 text-xs tracking-[1.5px] font-medium mb-1 flex items-center gap-2 pro-sparkle">
                PRO+
                {isProPlus && <span className="text-emerald-400 text-[10px] bg-emerald-500/10 px-2 py-px rounded">ACTIVE</span>}
              </div>
              <div className="flex items-end gap-1">
                <span className="text-[52px] leading-none font-semibold tracking-[-2px]">$15</span>
                <span className="text-zinc-400 pb-1">/mo</span>
              </div>
              <div className="text-emerald-400 text-sm mt-0.5 font-medium">Everything in Pro + AI Images + Scheduler + Analytics (Pro+ only) • Cancel anytime</div>
            </div>

            <ul className="space-y-[13px] text-[15px] mb-auto text-zinc-200">
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> <strong>Everything in Pro</strong></li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-violet-400">•</span> <strong><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/><line x1="19" y1="3" x2="19" y2="7"/><line x1="17" y1="5" x2="21" y2="5"/></svg> AI Image Generation</strong> (xAI Imagine, 1-4 per thread) <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-amber-500/10 text-amber-400 rounded">Pro+</span></li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-amber-400">•</span> <strong><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="17" cy="16" r="3"/><path d="M17 13v3h2"/></svg> Thread Scheduler</strong> — auto-post to X with best-time suggestions <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-amber-500/10 text-amber-400 rounded">Pro+</span></li>
              <li className="flex items-start gap-3"><span className="mt-1.5 text-amber-400">•</span> <strong><svg xmlns="http://www.w3.org/2000/svg" className="pro-plus-icon text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="4" height="10" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/><circle cx="6" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="18" cy="2" r="1" fill="currentColor"/></svg> Analytics &amp; Insights</strong> <span className="text-[9px] font-mono tracking-[1.5px] px-1.5 py-px bg-amber-500/10 text-amber-400 rounded">Pro+</span></li>
            </ul>

            {isProPlus ? (
              <div className="mt-8">
                <div className="w-full py-4 bg-emerald-500/10 text-emerald-400 font-semibold rounded-2xl text-center text-lg border border-emerald-500/30">
                  ✓ You have Pro+
                </div>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Manage subscription via Stripe Billing Portal</p>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleUpgrade('pro-plus')}
                  className="mt-8 w-full py-4 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white font-semibold rounded-2xl text-lg shadow-sm hover:shadow-[0_0_25px_rgba(167,139,250,0.5)] transition-all"
                >
                  Upgrade to Pro+ — $15/mo
                </button>
                <p className="text-center text-[11px] text-zinc-500 mt-3">Billed monthly. Cancel in seconds. Includes AI Images + Scheduler (Pro+ only).</p>
              </>
            )}
          </div>
        </div>

        <p className="text-center mt-8 text-xs text-zinc-500">Pro+ includes everything in Pro + AI Image Generation + Thread Scheduler + Analytics (Pro+ only). Existing Pro users are grandfathered into Pro+.</p>

        <div className="text-center mt-6 space-y-1">
          <p className="text-[11px] text-zinc-400">Early access – we’re building in public.</p>
          <p className="text-[10px] text-zinc-500">Join the first creators using ThreadForge. No fake testimonials. Real tool. Real results coming.</p>
        </div>
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
          {toast.action && (
            toast.action.href ? (
              <a
                href={toast.action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-3 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-colors active:scale-95"
                onClick={() => setToast(null)}
              >
                {toast.action.label}
              </a>
            ) : (
              <button
                onClick={() => {
                  toast.action?.onClick?.()
                  setToast(null)
                }}
                className="ml-2 px-3 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-colors active:scale-95"
              >
                {toast.action.label}
              </button>
            )
          )}
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
              Free: exactly 3 generations per day (resets daily). Sign in for your count, or upgrade to Pro ($9) for unlimited generations + Post to X + History, or Pro+ ($15) for everything including AI images, scheduler, and analytics.
            </p>

            <button 
              onClick={() => { openSignIn(); setShowAuthPrompt(false); }}
              className="w-full py-4 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors text-lg"
            >
              Sign in to continue free
            </button>

            <button 
              onClick={() => setShowAuthPrompt(false)}
              className="w-full mt-3 text-sm text-zinc-400 hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Post to X Preview & Edit Modal - premium dark glass style */}
      {showPostPreviewFor !== null && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          onClick={cancelPostPreview}
        >
          <div 
            className="glass-card border border-white/10 rounded-3xl p-0 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - fixed */}
            <div className="flex items-center justify-between p-6 pb-3 border-b border-white/10 flex-shrink-0">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">Preview &amp; Edit Thread</h3>
                <p className="text-[13px] text-zinc-400 mt-0.5">Edit any tweet. Assign images if attached. Then confirm to post as reply chain.</p>
              </div>
              <button 
                onClick={cancelPostPreview}
                className="text-zinc-400 hover:text-white text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>

            {/* Scrollable tweets list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {/* Display generated images inside modal (if any) - simplified */}
              {showPostPreviewFor !== null && getThreadImages({ id: showPostPreviewFor }).length > 0 && (
                <div className="mb-4 p-3 bg-zinc-900/70 border border-white/10 rounded-2xl">
                  <div className="text-[10px] font-medium text-violet-400 mb-1.5 tracking-[1.5px]">ATTACHED IMAGES — assign below per tweet</div>
                  <div className="grid grid-cols-4 gap-2">
                    {getThreadImages({ id: showPostPreviewFor }).map((img: any, idx: number) => (
                      <div key={idx} className="group relative overflow-hidden rounded border border-white/10 bg-zinc-950/50">
                        <img src={img.url} alt={`Preview image ${idx + 1}`} className="w-full aspect-[4/3] object-cover" />
                        <div className="text-[8px] p-0.5 text-center text-zinc-400 bg-black/50">{img.style}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewTweets.map((tweet, index) => {
                const charCount = tweet.length
                const overLimit = charCount > 280
                return (
                  <div key={index} className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-semibold text-violet-400 tracking-[1.5px]">TWEET {index + 1}</span>
                      <span className={`text-xs tabular-nums font-medium ${overLimit ? 'text-red-400' : 'text-zinc-400'}`}>
                        {charCount}/280
                      </span>
                    </div>
                    <textarea
                      value={tweet}
                      onChange={(e) => updatePreviewTweet(index, e.target.value)}
                      className={`w-full bg-zinc-950 border ${overLimit ? 'border-red-500/50' : 'border-white/10'} focus:border-violet-400 rounded-xl p-3.5 text-[14px] leading-relaxed min-h-[68px] resize-y outline-none`}
                      placeholder="Write your tweet..."
                    />
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <button
                        onClick={() => removePreviewTweet(index)}
                        disabled={previewTweets.length <= 1}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition min-h-[28px]"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => movePreviewTweet(index, -1)}
                        disabled={index === 0}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-40 transition min-h-[28px]"
                      >
                        ↑ Move up
                      </button>
                      <button
                        onClick={() => movePreviewTweet(index, 1)}
                        disabled={index === previewTweets.length - 1}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 disabled:opacity-40 transition min-h-[28px]"
                      >
                        ↓ Move down
                      </button>
                      <button
                        onClick={addPreviewTweet}
                        className="ml-auto text-[10px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition min-h-[28px]"
                      >
                        + Add tweet
                      </button>
                    </div>

                    {/* Assign image to this specific tweet */}
                    {showPostPreviewFor !== null && getThreadImages({ id: showPostPreviewFor }).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400">Attach to this tweet:</span>
                          <select
                            multiple
                            size={Math.min(4, getThreadImages({ id: showPostPreviewFor }).length || 1)}
                            value={(previewImageAssignments[index] || []).map(String)}
                            onChange={(e) => {
                              const vals = Array.from(e.target.selectedOptions, opt => parseInt(opt.value, 10)).filter(n => !isNaN(n))
                              setPreviewImageAssignments(prev => ({ ...prev, [index]: vals }))
                            }}
                            className="text-xs bg-zinc-950 border border-white/10 rounded p-1"
                          >
                            {getThreadImages({ id: showPostPreviewFor }).map((img: any, i: number) => (
                              <option key={i} value={i}>Image {i+1} ({img.style})</option>
                            ))}
                          </select>
                        </div>
                        {/* Show attached image preview(s) - supports multiple */}
                        {(() => {
                          const assigned = previewImageAssignments[index] || []
                          const pimgs = getThreadImages({ id: showPostPreviewFor })
                          if (!assigned.length) return null
                          return (
                            <div className="mt-1 flex gap-1 flex-wrap">
                              {assigned.map((aidx, k) => {
                                const aimg = pimgs[aidx]
                                if (!aimg) return null
                                return <img key={k} src={aimg.url} alt={`attached-${k}`} className="w-16 h-16 object-cover rounded border border-white/10" />
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Sticky footer with actions and confirm button */}
            <div className="flex-shrink-0 border-t border-white/10 bg-zinc-900/95 backdrop-blur p-6 sticky bottom-0 z-10">
              {/* Big clear confirm button */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={confirmPostFromPreview}
                  disabled={isPosting || previewTweets.filter(t => t.trim().length > 0).length === 0}
                  className="flex-1 py-3.5 bg-white text-zinc-950 font-semibold rounded-2xl text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-100 active:scale-[0.985] transition-all shadow"
                >
                  {isPosting ? 'Posting to X…' : 'Confirm & Post to X'}
                </button>
                <button
                  onClick={cancelPostPreview}
                  disabled={isPosting}
                  className="px-8 py-3.5 border border-white/10 text-sm font-medium rounded-2xl hover:bg-white/5 transition disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>

              <p className="text-center text-[10px] text-zinc-500 mt-3 tracking-[0.5px]">Images attach where assigned. Posts as reply chain via your X account. Edits preview-only.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
