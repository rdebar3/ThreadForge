import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

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
        // Mark user as paid in Clerk
        const client = await clerkClient()
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            hasPaid: true,
            paidAt: new Date().toISOString(),
            stripeSessionId: session.id,
          },
        })
        console.log(`✅ User ${userId} marked as paid via Clerk`)
      } else {
        console.log('⚠️ No client_reference_id (user not logged in during checkout)')
        // User can still be marked as paid on the success page if they sign in later
      }
    } catch (error) {
      console.error('Failed to update Clerk user metadata:', error)
      // Don't fail the webhook — Stripe will retry
    }
  }

  return NextResponse.json({ received: true })
}
