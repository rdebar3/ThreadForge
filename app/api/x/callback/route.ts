import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { exchangeCodeForXTokensAndSave } from '../../../lib/clerk'

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('x_oauth_verifier')?.value
  const storedState = cookieStore.get('x_oauth_state')?.value

  // Always clear cookies
  cookieStore.set('x_oauth_verifier', '', { maxAge: 0, path: '/' })
  cookieStore.set('x_oauth_state', '', { maxAge: 0, path: '/' })

  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in?redirect_url=/scheduler', req.url))
  }

  // Support both common naming: X_API_KEY / X_API_SECRET (preferred) or legacy X_CLIENT_ID / X_CLIENT_SECRET
  const clientId = process.env.X_API_KEY || process.env.X_CLIENT_ID
  const clientSecret = process.env.X_API_SECRET || process.env.X_CLIENT_SECRET
  const redirectUri = process.env.X_REDIRECT_URI || `${req.nextUrl.origin}/api/auth/callback/x`

  if (!clientId || !clientSecret) {
    console.error('[X OAuth] Missing X_API_KEY/X_API_SECRET (or fallback X_CLIENT_ID/X_CLIENT_SECRET) in /api/auth/callback/x . Check env vars + X app callback URL registration. See .env.example')
    return NextResponse.redirect(new URL('/scheduler?error=config', req.url))
  }

  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    console.error('X OAuth error from provider:', error)
    return NextResponse.redirect(new URL(`/scheduler?error=${encodeURIComponent(error)}`, req.url))
  }

  if (!code || !returnedState || returnedState !== storedState || !codeVerifier) {
    console.error('X OAuth state/verifier mismatch or missing code')
    return NextResponse.redirect(new URL('/scheduler?error=invalid_state', req.url))
  }

  console.log('[X OAuth Callback] All checks passed, calling exchangeCodeForXTokensAndSave for user', userId)

  try {
    // Now exchange throws on ANY failure (incl. saveXAccount verify failure).
    // We await it; if no throw, it succeeded.
    await exchangeCodeForXTokensAndSave(userId, code, codeVerifier, redirectUri)

    console.log('[X OAuth Callback] SUCCESS - X tokens saved, redirecting with connected=1')
    return NextResponse.redirect(new URL('/scheduler?connected=1', req.url))
  } catch (e: any) {
    console.error('[X OAuth Callback] error during exchange/save (threw on failure):', e?.message || e)
    const errCode = (e?.message || 'unknown').replace(/[^a-z0-9_-]/gi, '_') // sanitize for redirect
    return NextResponse.redirect(new URL(`/scheduler?error=${encodeURIComponent(errCode)}`, req.url))
  }
}
