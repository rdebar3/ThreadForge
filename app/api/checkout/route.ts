import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

/**
 * Stripe Checkout Route - Recurring Subscriptions
 * 
 * Creates a Stripe Checkout Session for Pro ($9) or Pro+ ($15) plans.
 * Primary confirmation of plan status happens via webhook.
 * Supports plan: 'pro' | 'pro-plus' in request body.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const secretKey = process.env.STRIPE_SECRET_KEY
    const plan = (body.plan as 'pro' | 'pro-plus') || 'pro'

    const priceId = plan === 'pro-plus' 
      ? process.env.STRIPE_PRICE_ID_PRO_PLUS 
      : process.env.STRIPE_PRICE_ID

    if (!secretKey) {
      console.error('STRIPE_SECRET_KEY is missing in environment variables')
      return NextResponse.json(
        { error: 'We couldn’t complete that action right now. Your work is safe in History.' },
        { status: 500 }
      )
    }

    if (!priceId) {
      console.error('Stripe price ID missing')
      return NextResponse.json(
        { error: 'We couldn’t complete that action right now. Your work is safe in History.' },
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

    const { successUrl, cancelUrl } = body
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
        plan: plan,  // 'pro' or 'pro-plus'
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
      { error: 'We couldn’t complete that action right now. Your work is safe in History.' },
      { status: 500 }
    )
  }
}