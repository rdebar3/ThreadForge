'use client'

import { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import type { Thread, GenerationRecord } from '../lib/types'
import { IMAGE_STYLES, type ImageStyle } from '../lib/prompts'

interface Suggestion {
  emojis: string[]
  hashtags: string[]
}

export default function HistoryPage() {
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()
  const legacyHasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const userPlan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacyHasPro ? 'pro-plus' : null)
  const hasPro = userPlan === 'pro' || userPlan === 'pro-plus'  // Pro or Pro+
  const isProPlus = userPlan === 'pro-plus'  // Image Gen exclusive

  const [history, setHistory] = useState<GenerationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({})
  const [suggestLoading, setSuggestLoading] = useState<Record<string, boolean>>({})
  const [copiedThreadId, setCopiedThreadId] = useState<string | null>(null)
  const [copiedTweetKey, setCopiedTweetKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Image generation states (Pro-only, per record+thread key)
  const [showImageModalFor, setShowImageModalFor] = useState<string | null>(null)
  const [selectedImageStyle, setSelectedImageStyle] = useState<ImageStyle>('auto')
  const [selectedImageCount, setSelectedImageCount] = useState(1)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [threadImages, setThreadImages] = useState<Record<string, Array<{url: string, style: string, revisedPrompt?: string}>>>({})

  useEffect(() => {
    if (isSignedIn && hasPro) {
      fetchHistory()
    } else {
      setLoading(false)
    }
  }, [isSignedIn, hasPro])

  const fetchHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/history')
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setError('Pro or Pro+ subscription required to view history.')
        } else {
          setError(data.error || 'Failed to load history')
        }
        return
      }
      setHistory(data.history || [])
    } catch (e) {
      setError('Failed to load history. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpanded(newExpanded)
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2600)
  }

  // Image helpers (duplicated for history page independence)
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

  async function handleGenerateImages(recordId: string, thread: Thread, recordTopic: string) {
    if (!isProPlus) {
      showToast('Image generation is a Pro+ feature. Upgrade to unlock AI images.', 'info')
      return
    }
    const key = `${recordId}-${thread.id}`
    setIsGeneratingImages(true)
    try {
      const res = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: recordTopic,
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
          showToast('Image generation is a Pro+ feature. Upgrade to Pro+ to unlock AI images.', 'info')
        } else if (data.rateLimited) {
          showToast(data.error || 'Please wait before generating more images.', 'info')
        } else {
          showToast(data.error || 'Failed to generate images', 'error')
        }
        return
      }
      setThreadImages(prev => ({ ...prev, [key]: data.images }))
      setShowImageModalFor(null)
      showToast(`Generated ${data.images?.length || 4} images!`, 'success')
    } catch (e) {
      showToast('Error generating images. Please try again.', 'error')
    } finally {
      setIsGeneratingImages(false)
    }
  }

  const copyThread = (recordId: string, thread: Thread) => {
    const fullThread = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(fullThread)
    setCopiedThreadId(`${recordId}-${thread.id}`)
    showToast('Full thread copied', 'success')
    setTimeout(() => setCopiedThreadId(null), 1500)
  }

  const copyTweet = (recordId: string, threadId: number, tweetIndex: number, tweet: string) => {
    navigator.clipboard.writeText(tweet)
    const key = `${recordId}-${threadId}-${tweetIndex}`
    setCopiedTweetKey(key)
    showToast('Tweet copied', 'success')
    setTimeout(() => setCopiedTweetKey(null), 1200)
  }

  const copyToX = (recordId: string, thread: Thread) => {
    const formatted = thread.tweets.join('\n\n')
    navigator.clipboard.writeText(formatted)
    showToast('Copied to clipboard and opened X composer', 'success')
    // Optional: open compose with first tweet
    const firstTweet = encodeURIComponent(thread.tweets[0])
    window.open(`https://x.com/compose/tweet?text=${firstTweet}`, '_blank')
  }

  const suggestForTweet = async (recordId: string, threadId: number, tweetIndex: number, tweet: string, topic: string) => {
    const key = `${recordId}-${threadId}-${tweetIndex}`
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

  const handleUpgrade = async () => {
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
      showToast('Failed to connect to payment system. Please try again in a moment.', 'error')
    }
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">Generation History</h1>
          <p className="text-zinc-400 mb-6">Sign in to view your Pro generation history.</p>
          <button 
            onClick={() => openSignIn()}
            className="px-6 py-3 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  if (!hasPro) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-zinc-900/70 border border-white/10 rounded-3xl p-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-4">Pro Feature</h1>
          <p className="text-zinc-400 mb-6">
            Generation History is available for Pro / Pro+ users only. Upgrade to unlock full access to your past threads and other Pro features.
          </p>
          <button
            onClick={handleUpgrade}
            className="w-full py-3 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors mb-3"
          >
            Upgrade to Pro — $9/mo
          </button>
          <a href="/" className="text-sm text-zinc-400 hover:text-white">Back to generator</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <nav className="border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="font-semibold text-2xl tracking-tighter">ThreadForge</a>
            <span className="text-zinc-500">/ History</span>
          </div>
          <a href="/" className="text-sm text-zinc-400 hover:text-white">← Back to Generator</a>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-tighter">Generation History</h1>
            <p className="text-zinc-400 mt-1">Your past Pro generations • Last 20 saved</p>
          </div>
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="text-sm px-4 py-2 rounded-2xl border border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-zinc-400">Loading history...</div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={fetchHistory} className="text-sm underline">Try again</button>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/60 border border-white/10 rounded-3xl p-8">
            <p className="text-xl text-zinc-300 mb-2">No history yet</p>
            <p className="text-zinc-400">Generate some threads while signed in as Pro to start building your library.</p>
            <a href="/" className="inline-block mt-6 px-5 py-2 bg-white text-zinc-950 rounded-2xl text-sm font-medium">Start Generating</a>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((record) => {
              const isExpanded = expanded.has(record.id)
              const date = new Date(record.timestamp).toLocaleString()
              return (
                <div key={record.id} className="bg-zinc-900/70 border border-white/10 rounded-3xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">{date}</div>
                      <div className="font-semibold text-lg tracking-tight">Topic: {record.topic}</div>
                      <div className="text-sm text-zinc-400 mt-0.5">{record.threads.length} threads</div>
                    </div>
                    <button
                      onClick={() => toggleExpand(record.id)}
                      className="text-sm px-4 py-1.5 rounded-2xl border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    >
                      {isExpanded ? 'Hide threads' : 'View threads'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-6 mt-4 pt-4 border-t border-white/10">
                      {record.threads.map((thread) => (
                        <div key={thread.id} className="bg-zinc-950/60 border border-white/10 rounded-2xl p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <div className="text-xs font-medium text-violet-400 tracking-[1.5px] mb-0.5">THREAD {thread.id}</div>
                              <div className="font-semibold text-lg leading-tight">{thread.title}</div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => copyThread(record.id, thread)}
                                title="Copy the entire thread (all tweets) to your clipboard"
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
                                </svg>
                                Copy All
                              </button>
                              <button
                                onClick={() => copyToX(record.id, thread)}
                                title="Copy the full thread and open X's compose window (Pro)"
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M18.244 2.25l-7.451 8.52L4.5 2.25H1.5l7.5 8.5L1.5 21.75h3l6.75-7.71 6.75 7.71h3l-7.5-8.5 7.5-8.5h-3z" />
                                </svg>
                                Post to X
                              </button>
                              {isProPlus ? (
                                <button
                                  onClick={() => {
                                    const key = `${record.id}-${thread.id}`
                                    setShowImageModalFor(key)
                                    setSelectedImageStyle('auto')
                                    setSelectedImageCount(1)
                                  }}
                                  title="Generate 1-4 relevant AI images for this thread (Pro+)"
                                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-zinc-800 hover:bg-violet-500 hover:text-white rounded-2xl transition-all active:scale-[0.985]"
                                >
                                  ✨ Generate Images
                                </button>
                              ) : hasPro ? (
                                <a
                                  href="#pricing"
                                  title="AI Images require Pro+"
                                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-zinc-800 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/30 rounded-2xl transition-all"
                                >
                                  Upgrade to Pro+ for AI Images
                                </a>
                              ) : null}
                            </div>
                          </div>

                          {/* Image choice panel for history - moved near top */}
                          {isProPlus && showImageModalFor === `${record.id}-${thread.id}` && (
                            <div className="mt-4 p-4 bg-zinc-900/60 border border-white/10 rounded-2xl">
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
                                  onClick={() => handleGenerateImages(record.id, thread, record.topic)}
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
                                  onClick={() => { setSelectedImageStyle('auto'); setSelectedImageCount(1); }}
                                  className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-all"
                                >
                                  Auto (1 image)
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Display generated images in history - moved to top (right below title / Post to X buttons) */}
                          {isProPlus && threadImages[`${record.id}-${thread.id}`]?.length > 0 && (
                            <div className="mt-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-violet-400 tracking-[1.5px]">IMAGES — {threadImages[`${record.id}-${thread.id}`][0]?.style}</div>
                                <button onClick={() => {
                                  const key = `${record.id}-${thread.id}`
                                  setShowImageModalFor(key)
                                  setSelectedImageStyle('auto')
                                  setSelectedImageCount(1)
                                }} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Regenerate</button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {threadImages[`${record.id}-${thread.id}`].map((img, idx) => (
                                  <div key={idx} className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/50">
                                    <img src={img.url} alt={`Visual ${idx + 1}`} className="w-full aspect-[4/3] object-cover group-hover:scale-105 transition-transform" />
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
                                      <button onClick={() => downloadImage(img.url, `thread-${thread.id}-${img.style}-${idx + 1}.jpg`)} className="text-[10px] px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white">Download</button>
                                      <button onClick={() => copyImageToClipboard(img.url)} className="text-[10px] px-2 py-0.5 bg-white/90 text-black rounded font-medium hover:bg-white">Copy</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            {thread.tweets.map((tweet, i) => {
                              const key = `${record.id}-${thread.id}-${i}`
                              const isCopied = copiedTweetKey === key
                              const sug = suggestions[key]
                              const isLoadingSug = suggestLoading[key]
                              return (
                                <div key={i} className="group flex gap-3 rounded-xl hover:bg-zinc-900/60 px-3 py-2 -mx-3 transition-colors">
                                  <div className="text-zinc-500 font-mono text-sm w-8 flex-shrink-0 pt-0.5 select-none">
                                    {i + 1}/
                                  </div>
                                  <div className="flex-1 text-[15px] leading-relaxed text-zinc-100">
                                    {tweet}
                                  </div>
                                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100">
                                    <button
                                      onClick={() => copyTweet(record.id, thread.id, i, tweet)}
                                      title="Copy just this single tweet"
                                      className="text-xs px-3 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-lg self-start text-zinc-400 hover:text-white transition-all flex items-center gap-1"
                                    >
                                      {isCopied ? 'Copied!' : (
                                        <>
                                          Copy Tweet
                                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16v-4m4 4v4m4-8v8m4-4v-4m-16 8h16a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2" />
                                          </svg>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={() => suggestForTweet(record.id, thread.id, i, tweet, record.topic)}
                                      disabled={isLoadingSug}
                                      title="Get Emojis & Hashtags for this tweet (Pro)"
                                      className="text-xs px-3 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 rounded-lg self-start transition-all disabled:opacity-50"
                                    >
                                      {isLoadingSug ? '...' : '✨ Emojis'}
                                    </button>
                                  </div>
                                  {sug && (
                                    <div className="text-xs text-violet-300 mt-1 pl-8 w-full">
                                      Emojis: {sug.emojis.join(' ')} &nbsp;&nbsp; Hashtags: {sug.hashtags.join(' ')}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm shadow-xl flex items-center gap-2 border ${
          toast.type === 'error' 
            ? 'bg-red-500/10 border-red-500/40 text-red-300' 
            : toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-zinc-900 border-zinc-700 text-zinc-200'
        }`}>
          <span>{toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : 'ℹ️'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
