# ThreadForge - Payment Setup Guide

This document explains exactly how to make the $9 one-time payment flow work.

## Current Status

The code is set up with:
- Stripe Checkout (one-time $9 payment)
- Success page that verifies payment + marks user as paid
- Webhook that also marks users as paid (more reliable)
- Free tier enforcement (3 generations) that respects `hasPaid`

## What You Need to Do

### 1. Stripe Account Setup

1. Go to https://dashboard.stripe.com
2. Switch to **Test Mode** (top right toggle)
3. Go to **Developers → API keys**
   - Copy your **Secret key** (starts with `sk_test_`)
   - Add it to `.env.local` as:
     ```
     STRIPE_SECRET_KEY=sk_test_...
     ```

4. Create a product:
   - Go to **Products** → **Add product**
   - Name: `ThreadForge - Unlimited Access`
   - Price: One-time payment → $9.00
   - Copy the **Price ID** (starts with `price_`)
   - Add to `.env.local`:
     ```
     STRIPE_PRICE_AMOUNT=900
     ```

### 2. Webhook Setup (Very Important)

#### For Local Development:
1. Install Stripe CLI if you haven't: https://stripe.com/docs/stripe-cli
2. Run this command in a separate terminal:
   ```bash
   stripe login
   ```
3. Then run:
   ```bash
   stripe listen --forward-to http://localhost:3000/api/webhook
   ```
4. Copy the **webhook signing secret** it gives you (starts with `whsec_`)
5. Add it to `.env.local`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

#### For Production (Vercel):
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhook`
3. Copy the **Signing secret** and add it as an environment variable on Vercel.

### 3. Environment Variables Needed

Add these to `.env.local` (and later to Vercel):

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          # From Stripe CLI or Dashboard
STRIPE_PRICE_AMOUNT=900

# xAI
XAI_API_KEY=xai-...

# Clerk (you should already have these)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

### 4. Testing the Full Flow Locally

1. Make sure you have a valid `XAI_API_KEY`
2. Start your dev server: `npm run dev`
3. In another terminal, run the Stripe listener (see step 2 above)
4. Sign in with Clerk
5. Generate threads until you hit the 3-generation limit
6. Click "Unlock Unlimited"
7. Use Stripe test card: `4242 4242 4242 4242`
   - Any future date
   - Any CVC
8. Complete checkout
9. You should be redirected to the success page
10. Go back to the main app — you should now have unlimited generations

### 5. Common Issues & Fixes

- **Webhook not firing locally**: Make sure `stripe listen` is running in a separate terminal.
- **User not marked as paid after checkout**: Check the success page + the webhook logs. Both try to mark the user.
- **"Payment system not configured" error**: Your `STRIPE_SECRET_KEY` is missing or invalid.
- **Limit still shows after paying**: The user metadata update can take a few seconds. Refresh the page or sign out/in.

### 6. Going to Production

When you're ready to go live:
- Switch Stripe to Live mode
- Replace test keys with live keys (`sk_live_...`)
- Update your webhook endpoint in Stripe to your real domain
- Add all keys as Environment Variables in Vercel

---

You can now focus on testing the flow locally using the Stripe test card.

Let me know when you've set up the keys and want help testing or fixing anything specific.
