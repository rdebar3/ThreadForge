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

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET is missing')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    console.log('✅ Payment successful for session:', session.id)

    try {
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
        console.log(`✅ User ${userId} marked as paid in Clerk via webhook`)
      } else {
        console.log('⚠️ No userId in client_reference_id — user will be marked paid via success page instead')
      }
    } catch (error) {
      console.error('Failed to update Clerk metadata in webhook:', error)
      // Stripe will automatically retry the webhook
    }
  }

  return NextResponse.json({ received: true })
}
