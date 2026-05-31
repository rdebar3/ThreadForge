# ThreadForge

Turn any topic into viral X/Twitter threads.

**Currently in free testing phase** — payments are disabled while we gather real user feedback.

## Features

- High-quality thread generation (Grok-powered or demo mode)
- Currently free / unlimited while we test the tool
- (Pricing will be introduced after initial testing phase)
- Optional sign-in with Google / email (powered by Clerk)
- Beautiful dark UI with excellent copy UX
- Stripe integration ready (currently disabled during free testing)

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
   - Endpoint: `https://threadforge.space/api/webhook`
   - Events: `checkout.session.completed`
4. **Get xAI API key** (recommended for quality)
5. **Deploy to Vercel**
6. **Add all env vars in Vercel**
7. **Switch Stripe to Live mode**
8. **Update webhook to production URL**

## Pricing Model (Planned)

- Currently **completely free** during testing phase
- Paid plans will be introduced after we validate the product with real users

## Legal Pages Included

- `/privacy`
- `/terms`
- `/refund`

---

Built with Next.js 16 + Tailwind + Clerk + Stripe.
