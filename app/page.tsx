'use client'

import { useState } from 'react'
import { useUser, UserButton, useClerk } from '@clerk/nextjs'

interface GeneratedImage {
  url: string
  style: string
  revisedPrompt?: string
}

const STYLES = ['Realistic', 'Cinematic', 'Boudoir', 'Lingerie', 'Romantic', 'Sensual'] as const
type Style = typeof STYLES[number]

const STYLE_KEY_MAP: Record<Style, string> = {
  Realistic: 'realistic',
  Cinematic: 'cinematic',
  Boudoir: 'boudoir',
  Lingerie: 'lingerie',
  Romantic: 'romantic',
  Sensual: 'sensual',
}

const EXAMPLE_PROMPTS = [
  "my perfect girlfriend with long dark hair, wearing elegant black lace lingerie, soft candlelight in our bedroom, looking at me with love",
  "beautiful blonde girlfriend in silky robe, golden hour by the window, seductive smile just for me",
  "my dream girlfriend, red lingerie, intimate pose on silk sheets, warm romantic lighting, she is mine",
  "elegant brunette girlfriend in delicate white lace, luxurious bed, soft light, tender and seductive",
  "your perfect AI girlfriend, long wavy hair, sensual black lingerie, romantic bedroom, always ready and beautiful for you",
]

export default function ImagineHer() {
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()

  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<Style>('Romantic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const isPaid = !!(user?.publicMetadata?.plan === 'pro' || user?.publicMetadata?.plan === 'pro-plus' || user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)

  const scrollToGenerator = () => {
    const el = document.getElementById('generator')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleStartCreating = () => {
    scrollToGenerator()
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setToast({ message: 'Please describe your dream girlfriend.', type: 'error' })
      return
    }

    if (!isSignedIn) {
      openSignIn()
      return
    }

    setIsGenerating(true)
    setToast(null)

    try {
      const res = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: STYLE_KEY_MAP[selectedStyle],
          count: 4,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 402) {
          setToast({ 
            message: data.error || 'Free limit reached (3 generations/day). Upgrade for unlimited.', 
            type: 'info' 
          })
        } else {
          setToast({ message: data.error || 'Something went wrong. Please try again.', type: 'error' })
        }
        return
      }

      const newImages: GeneratedImage[] = data.images || []
      setImages(newImages)
      setToast({ message: `Your girlfriend is here — ${newImages.length} beautiful images.`, type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Network error. Please try again.', type: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `imagine-her-${selectedStyle.toLowerCase()}-${index + 1}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
      setToast({ message: 'Downloaded. She\'s yours to keep.', type: 'success' })
    } catch (e) {
      setToast({ message: 'Download failed.', type: 'error' })
    }
  }

  const generateMoreLikeHer = (img: GeneratedImage) => {
    const newPrompt = img.revisedPrompt || prompt || 'my beautiful girlfriend, elegant and seductive'
    setPrompt(newPrompt)
    setSelectedStyle(selectedStyle)
    const el = document.getElementById('generator')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
      handleGenerate()
    }, 80)
  }

  const loadExample = (ex: string) => {
    setPrompt(ex)
    setSelectedStyle('Romantic')
    const el = document.getElementById('generator')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => {
      if (!isGenerating) handleGenerate()
    }, 250)
  }

  const clearResults = () => {
    setImages([])
    setPrompt('')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Subtle romantic soft lighting background */}
      <div className="fixed inset-0 bg-[radial-gradient(#2a1f2e_0%,transparent_70%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[linear-gradient(to_bottom,#3a1f2e0a_0%,transparent_35%)] pointer-events-none" />

      {/* Minimal elegant nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-2xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-serif text-[22px] tracking-[-0.5px] font-medium">Imagine Her</div>
          <div>
            {isSignedIn ? (
              <UserButton />
            ) : (
              <button onClick={() => openSignIn()} className="text-sm px-5 py-1.5 border border-white/20 rounded-full hover:bg-white/5 transition">Sign in</button>
            )}
          </div>
        </div>
      </nav>

      <div className="relative pt-16">
        {/* Centered luxurious landing */}
        <div className="max-w-3xl mx-auto px-6 pt-20 pb-14 text-center">
          <h1 className="font-serif text-[68px] md:text-[78px] leading-[0.95] tracking-[-3px] font-medium mb-5">
            Create Your Dream<br />Girlfriend
          </h1>
          <p className="text-[22px] text-white/75 tracking-[-0.3px] max-w-md mx-auto mb-9">
            Beautiful, seductive, and always ready for you.
          </p>

          <button 
            onClick={handleStartCreating}
            className="inline-block px-9 py-[17px] bg-white text-[#111] font-medium text-[15px] tracking-[0.5px] rounded-full hover:bg-[#f5f5f5] active:bg-white transition shadow-[0_4px_20px_rgb(0,0,0,0.3)]"
          >
            Start Creating
          </button>

          <div className="mt-5 text-[10px] tracking-[1.5px] text-white/40">
            Made with love using Grok Imagine
          </div>
        </div>

        {/* Generator */}
        <div id="generator" className="max-w-[860px] mx-auto px-6 pb-20">
          {/* Prompt */}
          <div className="mb-6">
            <div className="bg-white/[0.035] border border-white/10 rounded-3xl p-1.5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your perfect girlfriend... her look, her style, the mood..."
                className="w-full h-28 bg-transparent px-7 py-5 text-[17px] placeholder:text-white/35 focus:outline-none resize-y rounded-3xl leading-snug"
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Styles */}
          <div className="mb-6">
            <div className="text-[10px] tracking-[2.5px] text-white/45 mb-2.5 pl-1">CHOOSE HER MOOD</div>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => {
                const active = selectedStyle === s
                return (
                  <button
                    key={s}
                    onClick={() => setSelectedStyle(s)}
                    disabled={isGenerating}
                    className={`px-6 py-2 rounded-2xl text-sm border transition-all ${active ? 'bg-white text-black border-white' : 'border-white/15 text-white/75 hover:text-white hover:border-white/30'}`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full h-[58px] bg-white text-[#0a0a0a] font-semibold text-[17px] tracking-[-0.2px] rounded-3xl disabled:bg-white/70 transition-all flex items-center justify-center hover:bg-[#f8f8f8] active:bg-white"
          >
            {isGenerating ? 'Creating your girlfriend...' : 'Generate 4 Images'}
          </button>
          <p className="text-center text-[10px] text-white/35 mt-2.5 tracking-widest">{isSignedIn && !isPaid ? 'FREE • 3 PER DAY' : 'GIRLFRIEND TIER • UNLIMITED'}</p>

          {/* Results */}
          {images.length > 0 && (
            <div className="mt-12">
              <div className="flex justify-between items-baseline mb-5 px-1">
                <div className="text-xl tracking-tight">Your Girlfriend</div>
                <button onClick={clearResults} className="text-xs text-white/50 hover:text-white">NEW CREATION</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {images.map((img, i) => (
                  <div key={i} className="group relative rounded-3xl overflow-hidden border border-white/10 bg-black/40">
                    <img src={img.url} alt="Your AI Girlfriend" className="w-full aspect-[4/3] object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent flex gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => downloadImage(img.url, i)} className="flex-1 py-2 text-xs font-medium bg-white text-black rounded-2xl hover:bg-[#f0f0f0]">Download</button>
                      <button onClick={() => generateMoreLikeHer(img)} className="flex-1 py-2 text-xs font-medium bg-white/15 hover:bg-white/25 border border-white/30 rounded-2xl">Generate More Like Her</button>
                    </div>
                    {img.revisedPrompt && <div className="absolute top-3 left-3 text-[9px] max-w-[78%] bg-black/70 px-2.5 py-1 rounded-lg text-white/85 line-clamp-2">{img.revisedPrompt}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-[13px] text-sm rounded-2xl border shadow-2xl ${toast.type === 'success' ? 'bg-[#111] border-white/10' : 'bg-zinc-900 border-white/10'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
