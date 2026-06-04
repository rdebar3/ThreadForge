import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import crypto from 'crypto'
import { cookies } from 'next/headers'

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return hash.toString('base64url')
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  // Support both common naming: X_API_KEY / X_API_SECRET (preferred) or legacy X_CLIENT_ID / X_CLIENT_SECRET
  const clientId = process.env.X_API_KEY || process.env.X_CLIENT_ID

  // Ensure redirect_uri matches exactly what's registered in X Developer Portal for this Client ID.
  // Set X_REDIRECT_URI env for your local (http://localhost:3000/...) and production (https://threadforge.space/...) URLs.
  let redirectUri = process.env.X_REDIRECT_URI
  if (!redirectUri) {
    const origin = req.nextUrl.origin
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes(':3000')) {
      redirectUri = 'http://localhost:3000/api/auth/callback/x'
    } else {
      redirectUri = 'https://threadforge.space/api/auth/callback/x'
    }
  }

  if (!clientId) {
    console.error('[X OAuth] Missing X_API_KEY (preferred) or X_CLIENT_ID. Set in .env.local or hosting env. The OAuth authorize will use redirect_uri pointing to /api/auth/callback/x')
    return NextResponse.redirect(new URL('/scheduler?error=config', req.url))
  }

  console.log('[X OAuth Connect] Using redirect_uri for authorize:', redirectUri)

  const state = crypto.randomBytes(16).toString('hex')
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const scope = 'tweet.read tweet.write users.read offline.access'

  // Store verifier and state in short-lived httpOnly cookies for the callback
  const cookieStore = await cookies()
  cookieStore.set('x_oauth_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutes
    path: '/',
    sameSite: 'lax',
  })
  cookieStore.set('x_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://x.com/i/oauth2/authorize?${params.toString()}`
  return NextResponse.redirect(authUrl)
}
