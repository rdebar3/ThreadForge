import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(req: NextRequest) {
  try {
    const { successUrl, cancelUrl } = await req.json()

    // Create a Stripe Checkout Session for $9 one-time
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'ThreadForge - Unlimited Access',
              description: 'One-time payment for unlimited thread generations',
            },
            unit_amount: 900, // $9.00 in cents
          },
          quantity: 1,
        },
      ],
      success_url: successUrl || `${req.nextUrl.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.nextUrl.origin}/generate?cancelled=true`,
      metadata: {
        product: 'threadforge_unlimited',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
