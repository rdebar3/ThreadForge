# ThreadForge

Turn any topic into viral X/Twitter threads.

**Free tier:** 3 generations per day • **Pro:** $9/mo recurring for unlimited + priority features.

## Features

- High-quality thread generation (Grok-powered or demo mode)
- Free tier (3 generations/day) + paid Pro subscription ($9/mo recurring via Stripe)
- Optional sign-in with Google / email (powered by Clerk)
- Beautiful dark UI with excellent copy UX
- Full Stripe subscription integration (test mode ready, webhooks + fallbacks)

## Quick Start (Development)

```bash
npm run dev
```

## Required Environment Variables

Create a `.env.local` file **for local development**:

```env
# xAI (for real AI generation)
XAI_API_KEY=your_key_here

# Clerk - USE TEST KEYS FOR LOCALHOST (pk_test_ / sk_test_)
# Production keys (pk_live_ / sk_live_) are restricted to threadforge.space only
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Stripe - USE TEST KEYS FOR LOCAL DEV
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...   # Recurring $9/mo price ID from Stripe Test mode
```

**Important:** Never put production (live) Clerk or Stripe keys in `.env.local`. Use them only in Vercel for the production domain.

See `STRIPE_SETUP.md` for detailed test mode setup and the Launch Checklist below.

## Launch Checklist (Do These Before Going Live)

1. **Create Clerk account** → https://clerk.com
2. **Create Stripe account** → https://dashboard.stripe.com
3. **Create a recurring $9/mo price** in Stripe (Test mode first)
4. **Set up Stripe Webhook** (important)
   - Local: Use `stripe listen --forward-to http://localhost:3000/api/webhook`
   - Production: `https://your-domain/api/webhook` (events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted)
5. **Get xAI API key** (recommended for quality)
6. **Deploy to Vercel**
7. **Add all env vars in Vercel** (including STRIPE_PRICE_ID)
8. **Switch Stripe to Live mode** and update webhook URL

## Pricing Model

- **Free tier:** 3 generations per day (enforced for non-Pro users, with daily reset)
- **Pro:** $9/month recurring subscription (unlimited generations, priority, future features)
- Status stored in Clerk publicMetadata (`hasPro`, `stripeSubscriptionId`)
- Primary updates via webhooks; success page + mark-paid as fallbacks

## Legal Pages Included

- `/privacy`
- `/terms`
- `/refund`

---

Built with Next.js 16 + Tailwind + Clerk + Stripe.
