'use client';

import Link from 'next/link';

// Community Showcase - transparent early access page. No fake data. Fully honest.
export default function CommunityPage() {
  // Filter tabs are present for future but currently disabled (coming soon)
  const filterOptions = ['All', 'Newest', 'Most Liked', 'Launch', 'Lesson', 'Growth', 'Story'] as const;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      {/* Simple premium top nav - consistent with site */}
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
        {/* Stronger Hero - exclusive & honest */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-4">EARLY ACCESS</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-3">Community Showcase</h1>
          <p className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-3">Be one of the first 100 creators in the ThreadForge Community</p>
          <p className="text-lg text-zinc-400 max-w-lg mx-auto">An exclusive space for early members. Share your best threads, get discovered, and help shape the future of the showcase.</p>
        </div>

        {/* Inspiring Empty State with premium visual + prominent CTA */}
        <div className="max-w-lg mx-auto mb-14 text-center">
          <div className="glass-card rounded-3xl border border-white/10 p-10 relative overflow-hidden">
            {/* Subtle premium glowing thread / creators visual */}
            <div className="flex justify-center mb-6">
              <div className="relative w-28 h-28">
                {/* Outer glow ring */}
                <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-2xl" />
                {/* SVG glowing thread icon (stylized connected posts / thread) */}
                <svg 
                  width="112" 
                  height="112" 
                  viewBox="0 0 112 112" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="relative z-10"
                >
                  {/* Glow layers */}
                  <circle cx="56" cy="56" r="42" fill="url(#glowGrad)" opacity="0.25" />
                  <circle cx="56" cy="56" r="32" fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.4" />
                  {/* Central thread representation: stacked lines + connector */}
                  <rect x="32" y="30" width="48" height="6" rx="3" fill="#c4b5fd" />
                  <rect x="32" y="44" width="48" height="6" rx="3" fill="#a78bfa" />
                  <rect x="32" y="58" width="48" height="6" rx="3" fill="#c4b5fd" />
                  <rect x="32" y="72" width="48" height="6" rx="3" fill="#a78bfa" />
                  {/* Vertical connector "thread" */}
                  <path d="M56 36 L56 42 M56 50 L56 56 M56 64 L56 70" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Small accent nodes (creators) */}
                  <circle cx="28" cy="33" r="3.5" fill="#a78bfa" />
                  <circle cx="84" cy="47" r="3.5" fill="#67e8f9" />
                  <circle cx="28" cy="61" r="3.5" fill="#c4b5fd" />
                  <circle cx="84" cy="75" r="3.5" fill="#a78bfa" />
                  <defs>
                    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="40%">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#1e1135" />
                    </radialGradient>
                  </defs>
                </svg>
                {/* Subtle orbiting dots for "early community" feel */}
                <div className="absolute inset-0 community-icon-orbit">
                  <div className="absolute top-2 left-1/2 w-1.5 h-1.5 bg-violet-400/60 rounded-full -translate-x-1/2" />
                  <div className="absolute bottom-3 right-4 w-1 h-1 bg-cyan-400/50 rounded-full" />
                </div>
              </div>
            </div>

            <h3 className="text-2xl font-semibold tracking-tight mb-3">The community is just getting started.</h3>
            <p className="text-zinc-400 mb-8 text-[15px] leading-relaxed">No threads yet — but the first 100 creators who share will define what this space becomes. Be early. Be real.</p>

            {/* Prominent CTA */}
            <Link 
              href="/" 
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-100 active:scale-[0.985] transition-all text-base shadow-[0_10px_30px_-10px_rgba(167,139,250,0.4)] w-full sm:w-auto"
            >
              Create Your First Showcase Thread →
            </Link>
            <p className="mt-3 text-[10px] text-zinc-500 tracking-[1px]">It only takes a minute. Your threads will appear here once submitted.</p>
          </div>
        </div>

        {/* Filters - kept for future but fully disabled + transparent */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-zinc-500 mr-2">Filter</span>
            {filterOptions.map((f) => (
              <button
                key={f}
                disabled
                className="text-xs px-3 py-1 rounded-full border border-white/10 text-zinc-500/60 bg-zinc-900/40 cursor-not-allowed opacity-60"
                title="Coming soon"
              >
                {f}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-zinc-500 pl-1">Filters, sorting, and search are coming soon.</div>
        </div>

        {/* Why Share? - honest benefits */}
        <div className="mb-12">
          <div className="text-center mb-6">
            <div className="text-xs uppercase tracking-[2px] text-violet-400 mb-1">FOR FOUNDING MEMBERS</div>
            <h2 className="text-2xl font-semibold tracking-tight">Why Share?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "✨", title: "Get discovered early", desc: "Your best threads reach an audience of motivated X creators before the crowd arrives." },
              { icon: "🛠️", title: "Shape the platform", desc: "Early sharers influence what features (likes, comments, leaderboards) get built first." },
              { icon: "🏆", title: "Earn recognition", desc: "Founding creators will be highlighted as the community grows. Real reputation, no fakes." },
              { icon: "🔗", title: "Connect with peers", desc: "Meet other serious builders. This is not a vanity wall — it's a workshop for growth." },
            ].map((b, i) => (
              <div key={i} className="glass-card border border-white/10 rounded-2xl p-5 text-center">
                <div className="text-2xl mb-2.5">{b.icon}</div>
                <div className="font-semibold text-[15px] mb-1.5 tracking-tight">{b.title}</div>
                <p className="text-sm text-zinc-400 leading-snug">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Soon teaser - full transparency */}
        <div className="mb-10">
          <div className="text-center mb-6">
            <div className="text-xs uppercase tracking-[2px] text-cyan-400 mb-1">ROADMAP</div>
            <h2 className="text-2xl font-semibold tracking-tight">Coming Soon</h2>
            <p className="text-zinc-400 mt-1 text-sm">Real community features — built in the open with early members.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {[
              { label: "Likes & Reactions", note: "Appreciate threads you love" },
              { label: "Comments & Feedback", note: "Discuss what worked (and what didn't)" },
              { label: "Creator Leaderboards", note: "Top threads by real engagement" },
              { label: "Public Submissions", note: "Upload your own best threads directly" },
              { label: "Profiles & History", note: "See a creator's showcase in one place" },
              { label: "Weekly Highlights", note: "Curated threads + insights from the community" },
            ].map((item, idx) => (
              <div key={idx} className="glass-card border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-zinc-500">{item.note}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 whitespace-nowrap">Coming soon</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-zinc-500 mt-4">We&apos;re keeping this 100% real. No placeholder posts. When real threads arrive, you&apos;ll see them here first.</p>
        </div>
      </div>

      {/* Simple footer */}
      <div className="mt-16 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-500 max-w-5xl mx-auto px-6">
        <Link href="/" className="hover:text-zinc-400">← Back to ThreadForge</Link> · <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
      </div>
    </div>
  );
}
