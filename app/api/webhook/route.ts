import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'

/**
 * Stripe Webhook Handler
 * 
 * Handles recurring $9/mo Pro subscriptions + legacy one-time payments.
 * Primary source of truth for hasPro in Clerk publicMetadata.
 */

const stripeSecret = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

if (!stripeSecret || !webhookSecret) {
  console.error('❌ Missing required Stripe environment variables')
}

const stripe = new Stripe(stripeSecret || '', {
  apiVersion: '2023-10-16',
})

// Simple in-memory store to prevent processing duplicate events
// Note: This resets on every deployment / serverless cold start.
// For stronger guarantees, store processed event IDs in a database.
const processedEvents = new Set<string>()

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET is missing')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (!signature) {
    console.error('❌ Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('❌ Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // ============================================
  // IDEMPOTENCY (prevent duplicate processing)
  // ============================================
  // Primary check: in-memory (fast, but resets on cold starts)
  if (processedEvents.has(event.id)) {
    console.log(`⚠️ Duplicate event (in-memory cache): ${event.id}`)
    return NextResponse.json({ received: true })
  }

  // Secondary check: Clerk metadata (survives deployments)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id

    if (userId) {
      try {
        const client = await clerkClient()
        const user = await client.users.getUser(userId)
        const metadata = user.publicMetadata as any

        const alreadyPaid = metadata?.hasPaid === true || metadata?.hasPro === true
        const alreadyProcessed = metadata?.lastStripeEventId === event.id

        if (alreadyPaid || alreadyProcessed) {
          console.log(`⚠️ User ${userId} already processed (hasPro/hasPaid or matching event ID). Skipping.`)
          processedEvents.add(event.id)
          return NextResponse.json({ received: true })
        }
      } catch (err) {
        console.warn('Could not check Clerk metadata for idempotency (non-fatal):', err)
      }
    }
  }

  console.log(`📩 Received Stripe event: ${event.type} (ID: ${event.id})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        console.log('✅ checkout.session.completed received', {
          sessionId: session.id,
          mode: session.mode,
          paymentStatus: session.payment_status,
          userId: session.client_reference_id,
        })

        const userId = session.client_reference_id

        if (userId) {
          const client = await clerkClient()
          const user = await client.users.getUser(userId)
          const existing = (user.publicMetadata || {}) as Record<string, any>

          const isSub = session.mode === 'subscription'
          const subId = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id
          const custId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id

          const updates: Record<string, any> = {
            ...existing,
            hasPro: true,
            hasPaid: true, // backward compat with older one-time flow
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
          }

          if (isSub && subId) {
            updates.stripeSubscriptionId = subId
            updates.subscriptionStatus = 'active'
          }
          if (custId) {
            updates.stripeCustomerId = custId
          }

          await client.users.updateUserMetadata(userId, { publicMetadata: updates })
          console.log(`✅ User ${userId} marked hasPro via ${isSub ? 'subscription' : 'one-time'} checkout`)
        } else {
          console.warn('⚠️ No client_reference_id found — user may need to be marked paid on success page')
        }

        processedEvents.add(event.id)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        console.error('❌ Payment failed', {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          lastPaymentError: paymentIntent.last_payment_error?.message,
        })

        // You can add logic here later to notify the user or log to a database
        processedEvents.add(event.id)
        break
      }

      case 'charge.failed': {
        const charge = event.data.object as Stripe.Charge

        console.error('❌ Charge failed', {
          chargeId: charge.id,
          amount: charge.amount,
          failureMessage: charge.failure_message,
          failureCode: charge.failure_code,
        })

        processedEvents.add(event.id)
        break
      }

      // ============================================
      // SUBSCRIPTION LIFECYCLE (new in Phase 1)
      // ============================================
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const clerkUserId = subscription.metadata?.clerkUserId as string | undefined

        if (clerkUserId && clerkUserId !== 'unknown') {
          const isActive = ['active', 'trialing'].includes(subscription.status)
          const client = await clerkClient()
          const user = await client.users.getUser(clerkUserId)
          const existing = (user.publicMetadata || {}) as Record<string, any>

          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              ...existing,
              hasPro: isActive,
              hasPaid: isActive, // compat
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
            },
          })
          console.log(`✅ Sub updated for ${clerkUserId}: ${subscription.status} (hasPro=${isActive})`)
        }

        processedEvents.add(event.id)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const clerkUserId = subscription.metadata?.clerkUserId as string | undefined

        if (clerkUserId && clerkUserId !== 'unknown') {
          const client = await clerkClient()
          const user = await client.users.getUser(clerkUserId)
          const existing = (user.publicMetadata || {}) as Record<string, any>

          await client.users.updateUserMetadata(clerkUserId, {
            publicMetadata: {
              ...existing,
              hasPro: false,
              subscriptionStatus: 'canceled',
            },
          })
          console.log(`✅ Sub canceled for ${clerkUserId}`)
        }

        processedEvents.add(event.id)
        break
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`)
    }
  } catch (error) {
    console.error(`❌ Error processing event ${event.type} (${event.id}):`, error)
    // Return 200 so Stripe doesn't keep retrying a broken handler forever
    // We can add more sophisticated retry logic later if needed
    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
