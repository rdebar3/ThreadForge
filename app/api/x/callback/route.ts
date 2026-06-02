import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { saveXAccount } from '../../../lib/clerk'
import type { XAccount } from '../../../lib/types'

const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const X_USER_URL = 'https://api.x.com/2/users/me'

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

  const clientId = process.env.X_CLIENT_ID
  const clientSecret = process.env.X_CLIENT_SECRET
  const redirectUri = process.env.X_REDIRECT_URI || `${req.nextUrl.origin}/api/x/callback`

  if (!clientId || !clientSecret) {
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

  try {
    // Exchange code for tokens (confidential client)
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    const tokenRes = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: tokenBody.toString(),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('X token exchange failed:', tokenRes.status, err)
      return NextResponse.redirect(new URL('/scheduler?error=token_exchange', req.url))
    }

    const tokenData = await tokenRes.json()
    const accessToken: string = tokenData.access_token
    const refreshToken: string | undefined = tokenData.refresh_token
    const expiresIn: number = tokenData.expires_in || 7200
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Fetch X profile (username + id)
    const userRes = await fetch(X_USER_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!userRes.ok) {
      console.error('Failed to fetch X /users/me after connect')
      // Still save tokens if possible, but username unknown
    }

    let xUserId = 'unknown'
    let username = 'x_user'

    try {
      const userData = await userRes.json()
      xUserId = userData?.data?.id || 'unknown'
      username = userData?.data?.username || 'x_user'
    } catch {}

    const account: XAccount = {
      accessToken,
      refreshToken,
      expiresAt,
      xUserId,
      username,
      connectedAt: new Date().toISOString(),
    }

    await saveXAccount(userId, account)

    // Success redirect
    return NextResponse.redirect(new URL('/scheduler?connected=1', req.url))
  } catch (e: any) {
    console.error('X callback unexpected error:', e)
    return NextResponse.redirect(new URL('/scheduler?error=unknown', req.url))
  }
}
