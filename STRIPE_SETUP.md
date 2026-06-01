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

## Testing the Flow
1. Go to `/generate`
2. Generate threads until you hit the limit
3. Click **"Unlock unlimited threads for $9 one-time"**
4. Use Stripe test card: `4242 4242 4242 4242`
5. Any future date + any CVC
6. After payment, you should be redirected to `/success` and then have unlimited access

## Important Notes
- This is currently using localStorage for "paid" status (good for testing)
- For production, you should verify the session server-side and store the payment in a database + tie it to a user account (Clerk recommended)
