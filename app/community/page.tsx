'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';

// Community Showcase - now fully functional public feed + one-click submit from generator.
// Transparent, premium, dead-simple for first-time users.
interface ShowcasePost {
  id: string;
  title: string;
  tweets: string[];
  images?: Array<{ url: string; style: string; revisedPrompt?: string }>;
  likes: number;
  createdAt: string;
  authorName: string;
  likedByMe?: boolean;
}

export default function CommunityPage() {
  const { isSignedIn, user } = useUser();
  const { openSignIn } = useClerk();

  const [posts, setPosts] = useState<ShowcasePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortMode, setSortMode] = useState<'newest' | 'liked'>('newest');
  const [likingId, setLikingId] = useState<string | null>(null);

  // Fetch public feed (with likedByMe if signed in)
  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/community', { cache: 'no-store' });
      const data = await res.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (e) {
      console.error('Failed to load community posts', e);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  // Client-side sort (simple & instant)
  const sortedPosts = [...posts].sort((a, b) => {
    if (sortMode === 'liked') {
      if (b.likes !== a.likes) return b.likes - a.likes;
    }
    return b.createdAt.localeCompare(a.createdAt); // newest fallback
  });

  // Simple relative time (no extra deps)
  const timeAgo = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  };

  // Optimistic like + persist via API
  const handleLike = async (post: ShowcasePost) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    if (likingId) return;

    const wasLiked = !!post.likedByMe;
    const prevLikes = post.likes;

    // Optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likes: Math.max(0, p.likes + (wasLiked ? -1 : 1)), likedByMe: !wasLiked }
          : p
      )
    );
    setLikingId(post.id);

    try {
      const res = await fetch('/api/community/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });
      const data = await res.json();
      if (data?.success && typeof data.likes === 'number') {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id ? { ...p, likes: data.likes, likedByMe: data.likedByMe } : p
          )
        );
      } else {
        // revert
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, likes: prevLikes, likedByMe: wasLiked } : p))
        );
      }
    } catch {
      // revert
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likes: prevLikes, likedByMe: wasLiked } : p))
      );
    } finally {
      setLikingId(null);
    }
  };


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

        {/* Temporary disable banner for submissions (Phase 1.9) */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="glass-card border border-amber-500/40 bg-amber-500/10 rounded-2xl px-6 py-4 text-center">
            <p className="text-amber-300 text-sm font-medium">Community submissions are temporarily paused while we improve our system. Check back soon!</p>
          </div>
        </div>

        {/* Conditional: Beautiful empty state (when no posts) OR live functional feed */}
        {sortedPosts.length === 0 && !isLoading ? (
          <div className="max-w-lg mx-auto mb-14 text-center">
            <div className="glass-card rounded-3xl border border-white/10 p-10 relative overflow-hidden">
              {/* Subtle premium glowing thread / creators visual (kept exactly as inspiring empty) */}
              <div className="flex justify-center mb-6">
                <div className="relative w-28 h-28">
                  <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-2xl" />
                  <svg 
                    width="112" 
                    height="112" 
                    viewBox="0 0 112 112" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="relative z-10"
                  >
                    <circle cx="56" cy="56" r="42" fill="url(#glowGrad)" opacity="0.25" />
                    <circle cx="56" cy="56" r="32" fill="none" stroke="#a78bfa" strokeWidth="2" opacity="0.4" />
                    <rect x="32" y="30" width="48" height="6" rx="3" fill="#c4b5fd" />
                    <rect x="32" y="44" width="48" height="6" rx="3" fill="#a78bfa" />
                    <rect x="32" y="58" width="48" height="6" rx="3" fill="#c4b5fd" />
                    <rect x="32" y="72" width="48" height="6" rx="3" fill="#a78bfa" />
                    <path d="M56 36 L56 42 M56 50 L56 56 M56 64 L56 70" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round" />
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
                  <div className="absolute inset-0 community-icon-orbit">
                    <div className="absolute top-2 left-1/2 w-1.5 h-1.5 bg-violet-400/60 rounded-full -translate-x-1/2" />
                    <div className="absolute bottom-3 right-4 w-1 h-1 bg-cyan-400/50 rounded-full" />
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-semibold tracking-tight mb-3">The community is just getting started.</h3>
              <p className="text-zinc-400 mb-4 text-[15px] leading-relaxed">Be one of the first to share — the early threads here will shape what this space becomes. Your story matters.</p>

              {/* Motivational line for first-time users */}
              <p className="text-emerald-400 text-sm mb-8 font-medium">Your thread could be the first one featured here. Start sharing today!</p>

              {/* Prominent CTA - clearly leads to generator then one-click submit flow */}
              <Link 
                href="/" 
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-100 active:scale-[0.985] transition-all text-base shadow-[0_10px_30px_-10px_rgba(167,139,250,0.4)] w-full sm:w-auto"
              >
                Generate a Thread &amp; Submit to Showcase →
              </Link>
              <p className="mt-3 text-[10px] text-zinc-500 tracking-[1px]">Your thread will appear here instantly after submission. Under 2 minutes total.</p>
            </div>
          </div>
        ) : (
          /* LIVE FEED - vertical on mobile, clean cards, simple sort */
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-[2px] text-violet-400 mb-1">EARLY CREATORS</div>
                <h2 className="text-2xl font-semibold tracking-tight">Community Showcase</h2>
              </div>
              <Link href="/" className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/5 text-zinc-300">+ Submit from Generator</Link>
            </div>
            <p className="text-[11px] text-emerald-400/80 mb-3 -mt-1">Submissions from the generator appear here instantly. Your thread could be featured next.</p>

            {/* Simple sort tabs - Newest | Most Liked (exactly as requested) */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setSortMode('newest')}
                className={`text-xs px-4 py-1.5 rounded-full border transition ${sortMode === 'newest' ? 'bg-white text-zinc-950 border-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}
              >
                Newest
              </button>
              <button
                onClick={() => setSortMode('liked')}
                className={`text-xs px-4 py-1.5 rounded-full border transition ${sortMode === 'liked' ? 'bg-white text-zinc-950 border-white' : 'border-white/10 text-zinc-400 hover:text-white'}`}
              >
                Most Liked
              </button>
              <span className="ml-2 text-[10px] text-zinc-500">{sortedPosts.length} thread{sortedPosts.length === 1 ? '' : 's'}</span>
            </div>

            {isLoading ? (
              <div className="text-center py-10 text-zinc-400">Loading community threads…</div>
            ) : (
              <div className="space-y-4">
                {sortedPosts.map((post) => {
                  const previewTweets = post.tweets.slice(0, 3);
                  const mainImage = post.images && post.images[0];
                  return (
                    <div key={post.id} className="glass-card border border-white/10 rounded-3xl p-5 sm:p-6 max-w-2xl mx-auto hover:border-white/20 transition-colors">
                      {/* Header: author + date */}
                      <div className="flex items-center justify-between mb-3 text-xs">
                        <div className="text-violet-400 font-medium">{post.authorName}</div>
                        <div className="text-zinc-500">{timeAgo(post.createdAt)}</div>
                      </div>

                      {/* Optional main image - more prominent visual display for appeal */}
                      {mainImage && (
                        <div className="mb-3.5 rounded-2xl overflow-hidden border border-white/10 ring-1 ring-white/5">
                          <img
                            src={mainImage.url}
                            alt={post.title}
                            className="w-full aspect-[16/10] sm:aspect-[16/9] object-cover hover:scale-[1.015] transition-transform duration-300"
                          />
                        </div>
                      )}

                      {/* Title - cleaner, tighter typography */}
                      <div className="font-semibold text-[17px] sm:text-[20px] tracking-[-0.25px] leading-tight mb-2.5 pr-1 text-white">{post.title}</div>

                      {/* First 2-3 tweets preview - cleaner typography */}
                      <div className="space-y-1 text-[13px] sm:text-sm text-zinc-300 leading-relaxed mb-3.5">
                        {previewTweets.map((t, i) => (
                          <div key={i} className="line-clamp-2">• {t}</div>
                        ))}
                        {post.tweets.length > 3 && (
                          <div className="text-[10px] text-zinc-500">+{post.tweets.length - 3} more tweets</div>
                        )}
                      </div>

                      {/* Engagement row: likes (functional) */}
                      <div className="flex items-center justify-between pt-3 border-t border-white/10">
                        <button
                          onClick={() => handleLike(post)}
                          disabled={likingId === post.id}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full hover:bg-white/5 active:bg-white/10 transition disabled:opacity-60"
                          title={post.likedByMe ? 'Unlike' : 'Like this thread'}
                        >
                          <span className="text-base leading-none">{post.likedByMe ? '❤️' : '♡'}</span>
                          <span className="tabular-nums font-medium text-zinc-300">{post.likes}</span>
                          <span className="text-[10px] text-zinc-500 ml-0.5">likes</span>
                        </button>

                        <div className="text-[10px] text-zinc-500">Shared from ThreadForge</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sort note removed - now live tabs above feed (or hidden in empty) */}
        {sortedPosts.length > 0 && (
          <div className="text-[10px] text-center text-zinc-500 mb-8 -mt-6">Sorted client-side • Updates on refresh</div>
        )}

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
              { label: "Likes & Reactions", note: "Appreciate threads you love", live: true },
              { label: "Public Submissions", note: "One-click from generator (live now)", live: true },
              { label: "Comments & Feedback", note: "Discuss what worked (and what didn't)" },
              { label: "Creator Leaderboards", note: "Top threads by real engagement" },
              { label: "Profiles & History", note: "See a creator's showcase in one place" },
              { label: "Weekly Highlights", note: "Curated threads + insights from the community" },
            ].map((item, idx) => (
              <div key={idx} className="glass-card border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-zinc-500">{item.note}</div>
                </div>
                {item.live ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 whitespace-nowrap">Live now</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 whitespace-nowrap">Coming soon</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-zinc-500 mt-4">We&apos;re keeping this 100% real. Submit from the generator — your threads appear instantly. No fakes, no placeholders.</p>
        </div>
      </div>

      {/* Simple footer */}
      <div className="mt-16 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-500 max-w-5xl mx-auto px-6">
        <Link href="/" className="hover:text-zinc-400">← Back to ThreadForge</Link> · <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
      </div>
    </div>
  );
}
