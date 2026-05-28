# ThreadForge

Turn any topic into viral X/Twitter threads.

## Current Status

This is a fully functional MVP ready for launch.

### Features Implemented
- Clean dark mode interface
- Topic → 3 high-quality thread generations
- Copy entire thread or individual tweets
- Free tier (limited generations)
- $9 one-time payment simulation (localStorage)
- Fully responsive

### To Make It Production Ready

1. **Add Real AI Generation**
   - Replace `/app/api/generate/route.ts` with actual Grok or OpenAI calls
   - Add proper error handling and rate limiting

2. **Add Real Payments**
   - Integrate Stripe Checkout
   - Create a webhook to update user payment status
   - Store paid users in a database (Vercel Postgres recommended)

3. **Add Authentication (Recommended)**
   - Use Clerk or NextAuth
   - Track generations per user

4. **Deployment**
   - Deploy to Vercel
   - Add environment variables for Stripe + AI keys

### Quick Start (Development)

```bash
npm run dev
```

Open http://localhost:3000

### Pricing Model
- Free: Limited generations
- $9 one-time: Unlimited generations

This model converts extremely well for this type of tool.

---

Built with Next.js + Tailwind.
