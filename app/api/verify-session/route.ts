import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

/**
 * Verify Stripe Session
 * 
 * ⚠️ DISABLED DURING FREE TESTING PHASE
 * This route is kept for future paid functionality.
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

    if (session.payment_status === 'paid') {
      return NextResponse.json({ 
        success: true, 
        paid: true,
        sessionId: session.id 
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        paid: false 
      })
    }
  } catch (error) {
    console.error('Error verifying session:', error)
    return NextResponse.json({ error: 'Failed to verify session' }, { status: 500 })
  }
}
