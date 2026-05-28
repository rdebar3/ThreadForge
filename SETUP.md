# ThreadForge – Full Setup Guide

This guide walks you through everything you need to set up ThreadForge so you can test payments properly and prepare for launch.

---

## 1. Create a Clerk Account (Authentication)

Clerk handles sign-in and stores whether a user has paid.

1. Go to [https://clerk.com](https://clerk.com) and create an account.
2. Click **"Add application"**.
3. Name it `ThreadForge`.
4. Choose **Email + Google** as sign-in methods (recommended).
5. Finish setup.
6. Go to the **API Keys** tab in your Clerk dashboard.
7. Copy these two values:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

---

## 2. Create a Stripe Account (Payments)

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. Use **Test Mode** first (toggle in top right).
3. Go to **Developers → API keys** and copy:
   - `STRIPE_SECRET_KEY` (starts with `sk_test_`)
4. (Optional but recommended) Create a product:
   - Go to **Products** → **+ Add product**
   - Name: `ThreadForge Unlimited`
   - Price: One-time → $9.00
   - Save it (you may want the Price ID later)

---

## 3. Set Up Stripe Webhook (Very Important)

The webhook is what actually marks users as paid after they complete checkout.

### Local Testing (using Stripe CLI)

1. Install the Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run this command in your terminal:

```bash
stripe login
```

3. Start your Next.js dev server:

```bash
npm run dev
```

4. In a new terminal, forward Stripe events to your local app:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

5. Copy the webhook signing secret it gives you (starts with `whsec_`). This is your `STRIPE_WEBHOOK_SECRET`.

### Production (after deploying)

1. Deploy your app to Vercel first.
2. In Stripe Dashboard → **Developers → Webhooks** → **Add endpoint**.
3. Set the URL to: `https://yourdomain.com/api/webhook`
4. Select the event: `checkout.session.completed`
5. Copy the **Signing secret** after creating the endpoint.

---

## 4. Get an xAI API Key (Recommended)

For real high-quality threads:

1. Go to [https://x.ai](https://x.ai) or the Grok developer portal.
2. Create an API key.
3. Copy it as `XAI_API_KEY`.

> Without this key the app runs in demo mode with good but fake threads.

---

## 5. Create Your `.env.local` File

In the root of the `threadforge` folder, create a file called `.env.local` and paste this:

```env
# === AI Generation ===
XAI_API_KEY=your_xai_api_key_here

# === Clerk Authentication ===
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# === Stripe ===
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 6. Run the App Locally

```bash
npm run dev
```

Open http://localhost:3000

### Test the full flow:

1. Generate threads until you hit the free limit.
2. You should see a nice modal encouraging you to **Sign in**.
3. Sign in with Google or email.
4. After signing in, you should get 3 new free generations.
5. Hit the limit again → click **"Unlock unlimited for $9"**.
6. Use Stripe test card: `4242 4242 4242 4242` (any future date + any CVC).
7. After payment, you should be redirected to `/success` and have unlimited access.

---

## 7. Deploy to Vercel

1. Push your code to GitHub.
2. Go to [https://vercel.com](https://vercel.com) and import the repository.
3. Add all the environment variables from your `.env.local` during deployment.
4. Deploy.

After deployment:
- Update your Stripe webhook to point to your new Vercel URL.
- Test the payment flow again in production (still using Stripe test mode).

---

## 8. Go Live Checklist

- [ ] Switch Stripe from Test Mode to Live Mode
- [ ] Replace all test keys with live keys in Vercel
- [ ] Update the Stripe webhook URL to production
- [ ] Get a real `XAI_API_KEY`
- [ ] Test the entire flow end-to-end with a real card (or use Stripe test cards in live mode carefully)
- [ ] Update any placeholder text (e.g. "Used by 2,400+ creators")
- [ ] Set up a custom domain (optional but recommended)

---

## Common Issues & Fixes

**"Clerk is not working"**
- Make sure both Clerk keys are set correctly in `.env.local` or Vercel.
- Restart your dev server after adding keys.

**Payments not marking user as paid**
- The webhook is the most common source of problems.
- Make sure you're forwarding events locally with `stripe listen`.
- Check the terminal where `stripe listen` is running for errors.

**User still sees free limit after paying**
- Make sure the user was signed in when they started checkout (we pass their Clerk ID to Stripe).
- Check the Stripe Dashboard → check the `client_reference_id` on the successful session.

**Want to reset a user's paid status for testing?**
- Go to Clerk Dashboard → Users → find the user → edit their public metadata and remove `hasPaid`.

---

## Need Help?

If something isn't working, share:
- What step you're on
- Any error messages in the terminal or browser console

You're very close to having a sellable product.

Good luck with the launch!
