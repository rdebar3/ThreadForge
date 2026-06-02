'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { CommunityPost } from '../lib/types';

export default function CommunityPage() {
  type FilterType = 'All' | 'Newest' | 'Most Liked' | 'Launch' | 'Lesson' | 'Growth' | 'Story';

  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [likes, setLikes] = useState<Record<number, number>>({});

  // Sample placeholder data for the beautiful grid (ready for real user posts)
  const sampleThreads: CommunityPost[] = [
    { id: 1, title: "How I 3x'd my MRR in 90 days", snippet: "The exact playbook I used to go from $3k to $10k MRR without paid ads or hiring a content team.", author: "Alex Rivera", avatar: "AR", likes: 142, category: "Launch", imageId: 1015 },
    { id: 2, title: "The mistake that cost me $47k (and what I learned)", snippet: "I ignored my gut on pricing for 6 months. Here's the framework that finally fixed it.", author: "Maya Patel", avatar: "MP", likes: 89, category: "Lesson", imageId: 1025 },
    { id: 3, title: "From 0 to 12k followers in 4 months", snippet: "The posting cadence + thread formulas that actually moved the needle for my solo product.", author: "Jordan Kim", avatar: "JK", likes: 211, category: "Growth", imageId: 1033 },
    { id: 4, title: "Why most product launches flop on X", snippet: "I ran 7 launches in 2024. The ones that hit 6 figures had one thing in common.", author: "Sam Chen", avatar: "SC", likes: 67, category: "Lesson", imageId: 1040 },
    { id: 5, title: "I built in public for 18 months. Here's what worked.", snippet: "Documenting the ugly parts + consistent thread style turned my experiment into a real business.", author: "Taylor Brooks", avatar: "TB", likes: 154, category: "Growth", imageId: 106 },
    { id: 6, title: "The launch thread that got 2.3M impressions", snippet: "One sentence idea → 4 versions → the contrarian one crushed it. Here's the full breakdown.", author: "Priya Sharma", avatar: "PS", likes: 98, category: "Launch", imageId: 160 },
    { id: 7, title: "How a single failure thread landed me 3 clients", snippet: "I was embarrassed to post it. It became the highest-engagement thing I've ever written.", author: "Liam Torres", avatar: "LT", likes: 73, category: "Story", imageId: 201 },
    { id: 8, title: "My 30-day experiment posting 1 thread/day", snippet: "What the data showed about hooks, length, and timing. No guru advice — just receipts.", author: "Casey Morgan", avatar: "CM", likes: 187, category: "Growth", imageId: 29 },
  ];

  // Simple filtering + sorting logic (client-side for now)
  const filteredThreads: CommunityPost[] = [...sampleThreads]
    .filter(t => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Launch' || activeFilter === 'Lesson' || activeFilter === 'Growth' || activeFilter === 'Story') {
        return t.category === activeFilter;
      }
      return true;
    })
    .sort((a, b) => {
      if (activeFilter === 'Newest') return b.id - a.id;
      if (activeFilter === 'Most Liked') {
        const la = likes[a.id] ?? a.likes;
        const lb = likes[b.id] ?? b.likes;
        return lb - la;
      }
      return 0;
    });

  const handleLike = (id: number) => {
    const initialLikes = sampleThreads.find(t => t.id === id)?.likes ?? 0;
    setLikes(prev => ({
      ...prev,
      [id]: (prev[id] ?? initialLikes) + 1
    }));
  };

  const handleShare = (thread: CommunityPost) => {
    // Demo action
    navigator.clipboard?.writeText(`https://threadforge.example.com/thread/${thread.id}`).catch(() => {});
    // Simple visual feedback
    const el = document.createElement('div');
    el.textContent = 'Link copied!';
    el.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500/10 border border-emerald-400/40 text-emerald-300 text-xs px-4 py-2 rounded-2xl z-[100]';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  };

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
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs tracking-[2px] text-zinc-400 mb-4">COMMUNITY</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-3">Community Showcase</h1>
          <p className="text-xl text-zinc-400 max-w-md mx-auto">See what creators are building with ThreadForge</p>
        </div>

        {/* Empty state message + CTA */}
        <div className="max-w-md mx-auto mb-10 text-center">
          <div className="glass-card rounded-3xl border border-white/10 p-8">
            <div className="text-3xl mb-3">🌱</div>
            <h3 className="text-xl font-semibold tracking-tight mb-2">Be one of the first to showcase your best threads</h3>
            <p className="text-zinc-400 mb-6 text-sm">The community is just opening up. Share the threads you're most proud of and inspire others.</p>
            <Link 
              href="/" 
              className="inline-flex items-center justify-center px-6 py-2.5 bg-white text-zinc-950 font-semibold rounded-2xl hover:bg-zinc-100 transition text-sm w-full"
            >
              Create &amp; Share Your Thread →
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-widest text-zinc-500 mr-2">Filter</span>
            {(['All', 'Newest', 'Most Liked', 'Launch', 'Lesson', 'Growth', 'Story'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition ${activeFilter === f ? 'bg-violet-500/20 border-violet-400 text-violet-300' : 'border-white/10 hover:border-white/30 text-zinc-400 hover:text-white'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Beautiful grid with thread preview cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredThreads.map((thread: CommunityPost) => {
            const currentLikes = likes[thread.id] ?? thread.likes;
            return (
              <div key={thread.id} className="glass-card border border-white/10 rounded-2xl overflow-hidden flex flex-col hover:border-white/20 transition-all group">
                {/* Image placeholder with thread header style */}
                <div 
                  className="h-44 bg-cover bg-center relative" 
                  style={{ backgroundImage: `url(https://picsum.photos/id/${thread.imageId}/600/300)` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/60" />
                  <div className="absolute top-3 right-3 text-[9px] px-2 py-0.5 bg-black/60 rounded text-white/80 tracking-widest">AI IMAGE</div>
                  <div className="absolute bottom-3 left-3 text-xs px-2 py-0.5 bg-white/90 text-zinc-950 rounded font-medium">{thread.category}</div>
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <div className="font-semibold text-[15px] leading-tight mb-2 pr-2 group-hover:text-violet-200 transition">{thread.title}</div>
                  <p className="text-sm text-zinc-400 line-clamp-3 flex-1">{thread.snippet}</p>

                  {/* Author */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-white/20">
                      {thread.avatar}
                    </div>
                    <span className="text-xs text-zinc-400">{thread.author}</span>
                  </div>

                  {/* Actions: Like + Share */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 text-xs">
                    <button 
                      onClick={() => handleLike(thread.id)}
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 transition active:scale-95"
                    >
                      <span>❤️</span> 
                      <span>{currentLikes}</span>
                    </button>
                    <button 
                      onClick={() => handleShare(thread)}
                      className="flex items-center gap-1.5 text-zinc-400 hover:text-violet-400 transition active:scale-95"
                    >
                      <span>↗</span> 
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          Grid ready for real submissions. These are high-quality preview examples.
        </div>
      </div>

      {/* Simple footer */}
      <div className="mt-16 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-500 max-w-5xl mx-auto px-6">
        <Link href="/" className="hover:text-zinc-400">← Back to ThreadForge</Link> · <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
      </div>
    </div>
  );
}
