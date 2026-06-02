import Link from 'next/link'

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {/* Simple premium top nav */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tighter text-xl">ThreadForge</Link>
            <span className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">Community</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-zinc-400 hover:text-white">Generator</Link>
            <Link href="/history" className="text-zinc-400 hover:text-white">History</Link>
            <Link href="/scheduler" className="text-zinc-400 hover:text-white">Scheduler</Link>
            <Link href="#pricing" className="text-zinc-400 hover:text-white">Pricing</Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-4">COMMUNITY</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-3">Community Showcase</h1>
          <p className="text-xl text-zinc-400 max-w-md mx-auto">See what creators are building with ThreadForge</p>
        </div>

        {/* Beautiful empty state */}
        <div className="max-w-lg mx-auto mb-16">
          <div className="glass-card rounded-3xl border border-white/10 p-10 text-center">
            <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center text-4xl">🌱</div>
            <h3 className="text-2xl font-semibold tracking-tight mb-3">Be one of the first to share your best threads</h3>
            <p className="text-zinc-400 mb-8">The community showcase is just getting started. Turn your ideas into threads worth sharing.</p>
            <Link 
              href="/" 
              className="inline-block px-8 py-3 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-200 transition text-lg"
            >
              Create & Share Your Thread
            </Link>
            <div className="mt-6 text-xs text-zinc-500">Your threads will appear here once the community opens for submissions.</div>
          </div>
        </div>

        {/* Clean grid layout ready for future posts */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="text-lg font-semibold tracking-tight">Featured Threads</div>
            <div className="text-xs text-zinc-500">Coming soon</div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card border border-white/10 rounded-2xl p-6 h-48 flex flex-col justify-between opacity-60 hover:opacity-80 transition">
                <div>
                  <div className="text-xs text-violet-400 tracking-wider mb-2">THREAD PREVIEW</div>
                  <div className="h-3 bg-white/10 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-white/10 rounded w-1/2"></div>
                </div>
                <div className="text-xs text-zinc-500">Your thread could be here</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8 text-sm text-zinc-500">
            A clean, ready grid for real community posts. Stay tuned.
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <div className="mt-20 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-500">
        <Link href="/" className="hover:text-zinc-400">Back to ThreadForge</Link> · <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
      </div>
    </div>
  );
}
