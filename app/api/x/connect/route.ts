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

  const clientId = process.env.X_CLIENT_ID
  const redirectUri = process.env.X_REDIRECT_URI || `${req.nextUrl.origin}/api/x/callback`

  if (!clientId) {
    console.error('X_CLIENT_ID is not configured')
    return NextResponse.redirect(new URL('/scheduler?error=config', req.url))
  }

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
