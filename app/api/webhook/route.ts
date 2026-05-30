import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'

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

  // Idempotency check - skip if we've already processed this event
  if (processedEvents.has(event.id)) {
    console.log(`⚠️ Duplicate event received, skipping: ${event.id}`)
    return NextResponse.json({ received: true })
  }

  console.log(`📩 Received Stripe event: ${event.type} (ID: ${event.id})`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        console.log('✅ checkout.session.completed received', {
          sessionId: session.id,
          paymentStatus: session.payment_status,
          userId: session.client_reference_id,
        })

        const userId = session.client_reference_id

        if (userId) {
          const client = await clerkClient()
          await client.users.updateUserMetadata(userId, {
            publicMetadata: {
              hasPaid: true,
              paidAt: new Date().toISOString(),
              stripeSessionId: session.id,
            },
          })
          console.log(`✅ User ${userId} marked as paid via webhook`)
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
