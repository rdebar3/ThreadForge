import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

/**
 * Stripe Checkout Route - Recurring Subscriptions
 * 
 * Creates a Stripe Checkout Session for the $9/mo Pro plan.
 * Primary confirmation of Pro status happens via webhook.
 */

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    const priceId = process.env.STRIPE_PRICE_ID

    if (!secretKey) {
      console.error('STRIPE_SECRET_KEY is missing in environment variables')
      return NextResponse.json(
        { error: 'Payment system not configured. Missing STRIPE_SECRET_KEY.' },
        { status: 500 }
      )
    }

    if (!priceId) {
      console.error('STRIPE_PRICE_ID is missing in environment variables')
      return NextResponse.json(
        { error: 'Payment system not configured. Missing STRIPE_PRICE_ID (must be a recurring price ID from Stripe).' },
        { status: 500 }
      )
    }

    // Basic sanity check: if using test secret, price should look like a test price (price_ IDs are the same in test/live, but this helps catch misconfig)
    const isTestSecret = secretKey.startsWith('sk_test_')
    if (isTestSecret && !priceId.startsWith('price_')) {
      console.warn('Using test secret key but STRIPE_PRICE_ID does not look like a valid price ID')
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
          price: priceId,
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