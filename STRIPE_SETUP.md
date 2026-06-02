# Stripe Setup for ThreadForge (Test Mode)

## Step 1: Create a Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Use **Test Mode** (toggle in the top right)

## Step 2: Get Your API Keys
1. Go to Developers → API keys
2. Copy:
   - Publishable key (starts with `pk_test_`)
   - Secret key (starts with `sk_test_`)

## Step 3: Create a Product (Recurring Pro Subscription)
1. Go to Products → + Add product
2. Name: `ThreadForge Pro`
3. Price: **Recurring** → Monthly → $9.00
4. (Optional but recommended) Add a $0 "Free" tier product for reference
5. Copy the **Price ID** for the $9/mo recurring price (starts with `price_`)
6. Save it

**Important for Phase 1+**: This must be a recurring monthly price. One-time prices will no longer work for the new Pro flow.

## Step 4: Add to Environment Variables
Create `.env.local` in the root:

```env
XAI_API_KEY=your_xai_key
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
```

## Step 5: Run the Project
```bash
npm run dev
```

## Testing the Flow (Test Mode)
1. Make sure your `.env.local` has valid **test** keys and `STRIPE_PRICE_ID` pointing to a **recurring** $9/mo price created in Test mode.
2. Start the dev server: `npm run dev`
3. (Recommended for webhooks locally) In another terminal: `stripe listen --forward-to http://localhost:3000/api/webhook` (copy the whsec_ to STRIPE_WEBHOOK_SECRET if not already).
4. Sign in with Clerk.
5. Go to the Pricing section (or generate until you hit the free limit).
6. Click **"Upgrade to Pro — $9/mo"**
7. Use Stripe test card: `4242 4242 4242 4242`
8. Any future date + any CVC
9. Complete checkout → you will be redirected to `/success`
10. After success, you should be redirected back to the app with Pro active (unlimited generations, `hasPro` set in Clerk metadata).

## Important Notes
- Primary Pro status is set via Stripe webhook (most reliable).
- The success page + `/api/mark-paid` and `/api/verify-session` act as fallbacks.
- Always use **Test Mode** keys (`sk_test_`, `pk_test_`) and a test recurring Price ID when developing.
- The code now requires `STRIPE_PRICE_ID` to be set (no more hardcoded fallback).
- For production: switch to Live keys + update webhook endpoint in Stripe Dashboard.
- Use Clerk publicMetadata (`hasPro`, `stripeSubscriptionId`) as the source of truth for paid status.
