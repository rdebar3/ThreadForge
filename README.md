# ThreadForge

Turn any topic into viral X/Twitter threads.

**Production-ready version with Clerk authentication + persistent payments.**

## Features

- High-quality thread generation (Grok-powered or demo mode)
- 3 free generations for anonymous users
- $9 one-time payment for unlimited access (persistent via Clerk)
- Optional sign-in with Google / email (powered by Clerk)
- Beautiful dark UI with excellent copy UX
- Real Stripe checkout + webhook

## Quick Start (Development)

```bash
npm run dev
```

## Required Environment Variables

Create a `.env.local` file:

```env
# xAI (for real AI generation)
XAI_API_KEY=your_key_here

# Clerk (required for payments to persist)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

See `STRIPE_SETUP.md` and the "Launch Checklist" section below.

## Launch Checklist (Do These Before Going Live)

1. **Create Clerk account** → https://clerk.com
2. **Create Stripe account** → https://dashboard.stripe.com
3. **Set up Stripe Webhook** (important)
   - Endpoint: `https://yourdomain.com/api/webhook`
   - Events: `checkout.session.completed`
4. **Get xAI API key** (recommended for quality)
5. **Deploy to Vercel**
6. **Add all env vars in Vercel**
7. **Switch Stripe to Live mode**
8. **Update webhook to production URL**

## Pricing Model

- Free: 3 generations (per browser for anonymous users)
- $9 one-time: Unlimited generations (tied to Clerk account when signed in)

## Legal Pages Included

- `/privacy`
- `/terms`
- `/refund`

---

Built with Next.js 16 + Tailwind + Clerk + Stripe.
