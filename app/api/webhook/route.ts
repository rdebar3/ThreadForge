import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

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

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    console.log('✅ Payment successful for session:', session.id)
    console.log('Customer email:', session.customer_email)
    console.log('Amount paid:', session.amount_total)

    // TODO: When you add authentication (Clerk, etc.), store the payment here
    // Example: await markUserAsPaid(session.customer_email, session.id)
    
    // For now we just log it. You can later connect this to a database.
  }

  return NextResponse.json({ received: true })
}
