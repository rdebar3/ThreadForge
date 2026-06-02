import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Verify Stripe Session (used as fallback after checkout)
 * 
 * Supports both one-time and subscription checkouts.
 * For subscriptions, we also check the subscription status.
 */

const stripeSecret = process.env.STRIPE_SECRET_KEY

if (!stripeSecret) {
  console.error('❌ STRIPE_SECRET_KEY is missing')
}

const stripe = new Stripe(stripeSecret || '', {
  apiVersion: '2023-10-16',
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    let isPaid = false

    if (session.mode === 'subscription') {
      // For recurring subscriptions, check the subscription status
      const subId = typeof session.subscription === 'string' 
        ? session.subscription 
        : (session.subscription as any)?.id

      if (subId) {
        const subscription = await stripe.subscriptions.retrieve(subId)
        isPaid = ['active', 'trialing'].includes(subscription.status)
      } else if (session.payment_status === 'paid') {
        // Fallback if sub not attached yet
        isPaid = true
      }
    } else {
      // Legacy one-time payment
      isPaid = session.payment_status === 'paid'
    }

    return NextResponse.json({ 
      success: true, 
      paid: isPaid,
      sessionId: session.id,
      mode: session.mode
    })
  } catch (error) {
    console.error('Error verifying session:', error)
    return NextResponse.json({ error: 'Failed to verify session' }, { status: 500 })
  }
}
