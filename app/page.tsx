'use client'

import { useState } from 'react'
import { useUser, UserButton, useClerk } from '@clerk/nextjs'
import { IMAGE_STYLES, type ImageStyle } from './lib/prompts'

interface GeneratedImage {
  url: string
  style: string
  revisedPrompt?: string
}

const STYLE_LABELS: Record<ImageStyle, string> = {
  realistic: 'Realistic',
  cinematic: 'Cinematic',
  boudoir: 'Boudoir',
  lingerie: 'Lingerie',
  romantic: 'Romantic',
  sensual: 'Sensual',
  elegant: 'Elegant',
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

  const legacyHasPro = !!(user?.publicMetadata?.hasPro || user?.publicMetadata?.hasPaid)
  const userPlan = (user?.publicMetadata?.plan as 'pro' | 'pro-plus' | null) || (legacyHasPro ? 'pro-plus' : null)
  const isPaid = userPlan === 'pro' || userPlan === 'pro-plus'

  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<ImageStyle>('elegant')
  const [isGenerating, setIsGenerating] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const styles = [...IMAGE_STYLES] as ImageStyle[]

  const handleGenerate = async () => {
    if (!prompt.trim()) return
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
          style: selectedStyle,
          count: 4,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 402) {
          setToast({ 
            message: data.error || 'Daily free limit reached (3 generations). Upgrade for unlimited.', 
            type: 'info' 
          })
        } else {
          setToast({ message: data.error || 'Generation failed. Please try again.', type: 'error' })
        }
        return
      }

      const newImages: GeneratedImage[] = data.images || []
      setImages(newImages)
      setToast({ message: `Created ${newImages.length} elegant images`, type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Something went wrong. Please try again in a moment.', type: 'error' })
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
      link.download = `imagine-her-${selectedStyle}-${index + 1}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
      setToast({ message: 'Image downloaded', type: 'success' })
    } catch (e) {
      setToast({ message: 'Download failed', type: 'error' })
    }
  }

  const generateMore = () => {
    if (prompt.trim()) {
      handleGenerate()
    }
  }

  const loadExample = (ex: string) => {
    setPrompt(ex)
    setSelectedStyle('boudoir')
    // Auto generate for delight
    setTimeout(() => {
      if (!isGenerating) handleGenerate()
    }, 50)
  }

  const clearResults = () => {
    setImages([])
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      {/* Elegant Premium Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-zinc-950/95 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-semibold text-2xl tracking-[-1.5px]">Imagine Her</div>
            <div className="text-[10px] px-2 py-px rounded bg-white/10 text-white/50 tracking-[1px]">AI</div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#styles" className="hover:text-white transition">Styles</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <a href="/history" className="hover:text-white transition">Gallery</a>
          </div>

          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <UserButton />
            ) : (
              <button
                onClick={() => openSignIn()}
                className="px-5 py-2 text-sm font-medium border border-white/20 hover:bg-white/5 rounded-2xl transition"
              >
                Sign in
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 px-6 py-4 bg-zinc-950/95 text-sm">
            <div className="flex flex-col gap-3">
              <a href="#styles" className="py-1">Styles</a>
              <a href="#pricing" className="py-1">Pricing</a>
              <a href="/history" className="py-1">Gallery</a>
            </div>
          </div>
        )}
      </nav>

      <div className="pt-16">
        {/* Hero */}
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
          <div className="inline-block text-[10px] tracking-[4px] text-white/50 mb-3">PREMIUM • TASTEFUL • AI</div>
          <h1 className="text-6xl md:text-7xl font-semibold tracking-tighter mb-4">
            Create Your Dream Girlfriend
          </h1>
          <p className="text-xl text-white/70 max-w-md mx-auto">
            Beautiful, seductive, and always ready for you.
          </p>

          <button 
            onClick={() => document.getElementById('generator')?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-8 px-10 py-4 bg-gradient-to-r from-rose-400 to-violet-400 text-zinc-950 font-semibold text-lg rounded-2xl tracking-tight hover:brightness-110 active:scale-[0.985] transition shadow-xl"
          >
            Start Creating Your Girlfriend
          </button>
        </div>

        {/* Main Generator */}
        <div id="generator" className="max-w-[820px] mx-auto px-6 pb-16">
          <div className="bg-zinc-900/60 border border-white/10 rounded-3xl p-8 md:p-10 backdrop-blur-3xl shadow-2xl">
            {/* Prompt */}
            <div className="mb-7">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="text-xs tracking-[2px] text-white/50">DESCRIBE YOUR PERFECT GIRLFRIEND</div>
                {isSignedIn && !isPaid && (
                  <div className="text-[10px] text-amber-400/80">Free: 3 generations today</div>
                )}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="my perfect girlfriend with long dark hair, wearing elegant black lace lingerie, soft candlelight, looking at me lovingly in our bedroom..."
                className="w-full min-h-[118px] bg-zinc-950/80 border border-white/10 focus:border-white/40 rounded-2xl px-6 py-5 text-[17px] placeholder:text-white/40 resize-y leading-tight"
                disabled={isGenerating}
              />
            </div>

            {/* Style Selector - Elegant Pills */}
            <div className="mb-7">
              <div className="text-xs tracking-[2px] text-white/50 mb-3 px-1">CHOOSE HER VIBE</div>
              <div className="flex flex-wrap gap-2">
                {styles.map((s) => {
                  const active = selectedStyle === s
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedStyle(s)}
                      disabled={isGenerating}
                      className={`px-5 py-[9px] rounded-2xl text-sm font-medium border transition-all active:scale-[0.985] ${
                        active 
                          ? 'bg-white text-zinc-950 border-white' 
                          : 'border-white/15 hover:border-white/40 text-white/80 hover:text-white'
                      }`}
                    >
                      {STYLE_LABELS[s]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Big Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="w-full h-14 bg-gradient-to-r from-rose-400 via-violet-400 to-indigo-400 hover:brightness-105 disabled:brightness-75 text-zinc-950 font-semibold text-lg tracking-[-0.3px] rounded-2xl transition-all flex items-center justify-center gap-3 disabled:cursor-not-allowed active:scale-[0.985] shadow-xl"
            >
              {isGenerating ? (
                <>Creating your girlfriend…</>
              ) : (
                <>Generate 4 Images</>
              )}
            </button>

            <p className="text-center text-[10px] text-white/40 mt-3 tracking-wider">She is yours • Always beautiful • Only for you</p>
          </div>
        </div>

        {/* Example Prompts */}
        {!images.length && (
          <div className="max-w-3xl mx-auto px-6 pb-12">
            <div className="text-[10px] tracking-[2px] text-white/40 mb-3 px-1">TRY THESE</div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex, idx) => (
                <button
                  key={idx}
                  onClick={() => loadExample(ex)}
                  className="text-left text-xs px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition max-w-[280px] truncate"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results - Premium Gallery */}
        {images.length > 0 && (
          <div className="max-w-6xl mx-auto px-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-6 gap-y-3">
              <div>
                <div className="text-3xl font-semibold tracking-[-1px]">Your Girlfriend</div>
                <div className="text-white/60 text-sm mt-0.5">4 images of your girlfriend • {STYLE_LABELS[selectedStyle]} vibe • She exists just for you</div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={generateMore}
                  disabled={isGenerating}
                  className="px-7 py-2.5 text-sm font-medium border border-white/20 hover:bg-white/5 active:bg-white/10 rounded-2xl transition"
                >
                  Generate More
                </button>
                <button
                  onClick={clearResults}
                  className="px-7 py-2.5 text-sm font-medium text-white/60 hover:text-white transition"
                >
                  New Creation
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
              {images.map((img, i) => (
                <div key={i} className="group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/40 shadow-xl">
                  <img 
                    src={img.url} 
                    alt={`Imagine Her ${i + 1}`} 
                    className="w-full aspect-[4/3.1] object-cover" 
                  />
                  {/* Elegant hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/70 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                  
                  <div className="absolute bottom-5 right-5 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => downloadImage(img.url, i)}
                      className="flex items-center gap-2 px-4 py-1.5 bg-white/95 text-zinc-950 text-xs font-semibold rounded-2xl shadow hover:bg-white active:scale-95"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => {
                        if (img.revisedPrompt) setPrompt(img.revisedPrompt);
                        setSelectedStyle(selectedStyle);
                        // trigger generate more like her
                        setTimeout(() => handleGenerate(), 100);
                      }}
                      className="flex items-center gap-2 px-4 py-1.5 bg-rose-500/90 text-white text-xs font-semibold rounded-2xl shadow hover:bg-rose-500 active:scale-95"
                    >
                      Generate More Like Her
                    </button>
                  </div>

                  {img.revisedPrompt && (
                    <div className="absolute bottom-5 left-5 max-w-[60%] text-[10px] text-white/80 line-clamp-2 opacity-0 group-hover:opacity-100 transition">
                      {img.revisedPrompt}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center mt-8 text-[10px] text-white/40 tracking-widest">
              EACH IMAGE IS UNIQUE • CRAFTED WITH CARE • FOR YOUR EYES ONLY
            </div>
          </div>
        )}

        {/* Pricing Teaser */}
        <div id="pricing" className="max-w-3xl mx-auto px-6 py-16 border-t border-white/10">
          <div className="text-center mb-8">
            <div className="text-xs tracking-[3px] text-white/50 mb-1">UNLOCK UNLIMITED CREATIVITY</div>
            <div className="text-3xl font-semibold tracking-tight">Simple, elegant pricing</div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm max-w-xl mx-auto">
            <div className="border border-white/10 rounded-3xl p-6">
              <div className="font-medium">Free</div>
              <div className="text-3xl font-semibold mt-1 tracking-tighter">3 <span className="text-base font-normal text-white/50">/ day</span></div>
              <div className="mt-4 text-white/60 text-xs leading-relaxed">Explore the fantasy. Create 3 images of your girlfriend every day.</div>
            </div>
            <div className="border border-rose-400/30 rounded-3xl p-6 bg-rose-950/20">
              <div className="font-medium text-rose-300">Girlfriend Tier</div>
              <div className="text-3xl font-semibold mt-1 tracking-tighter text-rose-300">$15 <span className="text-base font-normal text-white/50">/ mo</span></div>
              <div className="mt-4 text-white/60 text-xs leading-relaxed">Unlimited generations. She is always there for you. Premium, addictive access.</div>
            </div>
          </div>
          <div className="text-center mt-6 text-[10px] text-white/40">Cancel anytime. Powered by Stripe + Clerk.</div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl bg-zinc-900 border border-white/10 text-sm shadow-2xl">
          {toast.message}
        </div>
      )}
    </div>
  )
}
