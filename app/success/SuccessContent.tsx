'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'

export default function SuccessContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (!sessionId) {
      setStatus('error')
      return
    }

    // Securely verify the payment with Stripe before marking as paid
    const verifyPayment = async () => {
      try {
        const res = await fetch(`/api/verify-session?session_id=${sessionId}`)
        const data = await res.json()

        if (data.paid) {
          // Mark the user as paid in Clerk (this is the source of truth)
          try {
            await fetch('/api/mark-paid', { method: 'POST' })
          } catch (e) {
            console.error('Could not mark user as paid in Clerk')
          }

          // Clear any old localStorage data (cleanup)
          localStorage.removeItem('threadforge_paid')
          localStorage.removeItem('threadforge_paid_at')

          setStatus('success')

          // Redirect back to app with success flag so it can refresh paid status
          setTimeout(() => {
            window.location.href = '/?paid=success'
          }, 1800)
        } else {
          setStatus('error')
        }
      } catch (error) {
        console.error('Verification failed:', error)
        setStatus('error')
      }
    }

    verifyPayment()
  }, [sessionId])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-zinc-400">Verifying your payment...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-semibold mb-4">Something went wrong</h1>
          <p className="text-zinc-400 mb-6">We couldn't verify your payment. Please try again or contact support.</p>
          <Link 
            href="/" 
            className="inline-block px-6 py-3 bg-white text-zinc-950 rounded-2xl font-medium"
          >
            Back to Generator
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-8">
          <span className="text-6xl">🚀</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter mb-4">
          Welcome to unlimited ThreadForge!
        </h1>
        
        <p className="text-xl text-zinc-400 mb-8">
          Your payment was successful. You now have unlimited access to generate as many high-quality threads as you want — no limits, no subscriptions.
        </p>

        <div className="space-y-4">
          <Link 
            href="/" 
            className="block w-full py-4 bg-white text-zinc-950 font-semibold rounded-3xl hover:bg-zinc-200 transition-colors text-lg"
          >
            Start Creating Threads
          </Link>
          
          <Link 
            href="/" 
            className="block text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Back to homepage
          </Link>
        </div>

        <div className="mt-10 text-xs text-zinc-500 border-t border-zinc-800 pt-6">
          Pro tip: The more specific your topic, the better the threads. Try adding context like your niche or goal.
        </div>

        <p className="text-[10px] text-zinc-500 mt-6">
          Unlimited access is saved to your account.
        </p>
      </div>
    </div>
  )
}
