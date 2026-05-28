import { auth, currentUser } from '@clerk/nextjs/server'

export type UserPaymentStatus = {
  isPaid: boolean
  freeGenerationsUsed: number
  userId: string | null
  isLoggedIn: boolean
}

/**
 * Get the user's payment status.
 * Priority:
 * 1. If logged in via Clerk → use publicMetadata (hasPaid + freeGenerationsUsed)
 * 2. If not logged in → fall back to localStorage values (client only)
 */
export async function getUserPaymentStatus(): Promise<UserPaymentStatus> {
  try {
    const { userId } = await auth()

    if (userId) {
      const user = await currentUser()
      const metadata = user?.publicMetadata as {
        hasPaid?: boolean
        freeGenerationsUsed?: number
      } | undefined

      return {
        isPaid: metadata?.hasPaid === true,
        freeGenerationsUsed: metadata?.freeGenerationsUsed ?? 0,
        userId,
        isLoggedIn: true,
      }
    }
  } catch (error) {
    // Clerk not configured or error — fall through to anonymous
    console.log('[Auth] Clerk not available, using anonymous mode')
  }

  // Anonymous user (no Clerk or not signed in)
  return {
    isPaid: false,
    freeGenerationsUsed: 0,
    userId: null,
    isLoggedIn: false,
  }
}

/**
 * Client-side helper to get free generations used from localStorage.
 * Only use this on the client when the user is not logged in.
 */
export function getAnonymousFreeGenerationsUsed(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem('threadforge_free_generations') || '0')
}

/**
 * Client-side helper to increment anonymous free generations.
 */
export function incrementAnonymousFreeGenerations(): number {
  if (typeof window === 'undefined') return 0
  const current = getAnonymousFreeGenerationsUsed()
  const next = current + 1
  localStorage.setItem('threadforge_free_generations', next.toString())
  return next
}

/**
 * Check if user has remaining free generations (works for both logged in and anonymous).
 */
export async function canUserGenerate(): Promise<{ canGenerate: boolean; reason?: string }> {
  const status = await getUserPaymentStatus()

  if (status.isPaid) {
    return { canGenerate: true }
  }

  const used = status.isLoggedIn 
    ? status.freeGenerationsUsed 
    : getAnonymousFreeGenerationsUsed()

  if (used >= 3) {
    return { 
      canGenerate: false, 
      reason: 'free_limit_reached' 
    }
  }

  return { canGenerate: true }
}
