# Stripe Setup for ThreadForge (Test Mode)

## Step 1: Create a Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Use **Test Mode** (toggle in the top right)

## Step 2: Get Your API Keys
1. Go to Developers → API keys
2. Copy:
   - Publishable key (starts with `pk_test_`)
   - Secret key (starts with `sk_test_`)

## Step 3: Create a Product
1. Go to Products → + Add product
2. Name: `ThreadForge - Unlimited Access`
3. Price: One-time → $9.00
4. Copy the **Price ID** (starts with `price_`)
5. Save it

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
