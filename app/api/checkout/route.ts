import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

/**
 * Stripe Checkout Route - Recurring Subscriptions (Phase 1)
 * 
 * Creates a Stripe Checkout Session for the $9/mo Pro plan.
 * Primary confirmation of Pro status happens via webhook (supports subscriptions).
 * Fallbacks (verify-session + mark-paid) kept for compatibility.
 */

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY

    if (!secretKey) {
      console.error('STRIPE_SECRET_KEY is missing in environment variables')
      return NextResponse.json(
        { error: 'Payment system not configured' },
        { status: 500 }
      )
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
    })

    const { successUrl, cancelUrl } = await req.json()
    const { userId } = await auth()

    // Basic validation
    if (successUrl && typeof successUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid successUrl' }, { status: 400 })
    }
    if (cancelUrl && typeof cancelUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid cancelUrl' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID || 'price_1TcFakCS6rFBWmntHVjrbe8t',
          quantity: 1,
        },
      ],
      success_url: successUrl || `${req.nextUrl.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.nextUrl.origin}/`,
      client_reference_id: userId || undefined,
      metadata: {
        product: 'threadforge_pro',
        plan: 'pro_monthly',
      },
      // Pass userId into the Subscription so subscription.* webhooks can map back to Clerk user
      subscription_data: userId
        ? {
            metadata: {
              clerkUserId: userId,
            },
          }
        : undefined,
      // Primary Pro status updates come from webhooks for reliability on recurring subs
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}