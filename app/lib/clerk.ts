import { clerkClient } from '@clerk/nextjs/server'
import type { GenerationRecord, Thread, XAccount, ScheduledPost, Template } from './types'

/**
 * Increment the total generations count for a user in Clerk publicMetadata.
 * Used for lightweight analytics.
 */
export async function incrementUserGenerations(userId: string, count: number = 1) {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const currentCount = (user.publicMetadata?.totalGenerations as number) || 0

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        totalGenerations: currentCount + count,
        lastGeneratedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to increment user generations:', error)
    // Don't throw — analytics failure shouldn't break generation
  }
}

/**
 * Get basic usage stats for the admin dashboard.
 * This is intentionally simple.
 */
export async function getUsageStats(limit: number = 50) {
  try {
    const client = await clerkClient()
    
    // Fetch users (we'll paginate in the future if needed)
    const { data: users } = await client.users.getUserList({
      limit: Math.min(limit, 100), // Clerk max per page is 100
    })

    let totalGenerations = 0
    let usersWithGenerations = 0

    const topUsers = users
      .map((user) => {
        const generations = (user.publicMetadata?.totalGenerations as number) || 0
        if (generations > 0) {
          usersWithGenerations++
          totalGenerations += generations
        }
        return {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress || 'No email',
          firstName: user.firstName,
          lastName: user.lastName,
          totalGenerations: generations,
          lastGeneratedAt: user.publicMetadata?.lastGeneratedAt as string | undefined,
        }
      })
      .sort((a, b) => b.totalGenerations - a.totalGenerations)
      .slice(0, 20) // Top 20

    return {
      totalUsers: users.length,
      usersWithGenerations,
      totalGenerations,
      topUsers,
    }
  } catch (error) {
    console.error('Failed to get usage stats:', error)
    return {
      totalUsers: 0,
      usersWithGenerations: 0,
      totalGenerations: 0,
      topUsers: [],
      error: 'Failed to load stats',
    }
  }
}

/**
 * Get generation history for a Pro user from Clerk publicMetadata.
 * Limited to most recent entries for metadata size.
 */
export async function getGenerationHistory(userId: string): Promise<GenerationRecord[]> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const history = (user.publicMetadata?.generationHistory as GenerationRecord[]) || []
    return history
  } catch (error) {
    console.error('Failed to get generation history:', error)
    return []
  }
}

/**
 * Save a new generation record to the user's history in Clerk publicMetadata.
 * Only call for Pro users. Keeps only the most recent 20 entries.
 */
export async function saveGenerationToHistory(userId: string, record: Omit<GenerationRecord, 'id'>): Promise<void> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const existing: GenerationRecord[] = (user.publicMetadata?.generationHistory as GenerationRecord[]) || []

    const newRecord: GenerationRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      ...record,
    }

    const updated = [newRecord, ...existing].slice(0, 20)

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        generationHistory: updated,
      },
    })
  } catch (error) {
    console.error('Failed to save generation to history:', error)
    // Do not throw — history save failure should not break generation
  }
}

/**
 * User plan types for 3-tier pricing.
 */
export type UserPlan = 'pro' | 'pro-plus' | null

/**
 * Get the user's current plan from Clerk metadata.
 * Falls back to 'pro-plus' for legacy hasPro/hasPaid users (grandfathering).
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const plan = (user.publicMetadata?.plan as UserPlan) || null

    if (plan) {
      return plan
    }

    // Grandfather existing Pro users into Pro+ (at least temporarily)
    const hasLegacyPro = user.publicMetadata?.hasPro === true || user.publicMetadata?.hasPaid === true
    if (hasLegacyPro) {
      return 'pro-plus'
    }

    return null
  } catch (error) {
    console.error('Failed to get user plan:', error)
    return null
  }
}

/**
 * Check if user has Pro+ (includes image generation).
 */
export async function isProPlus(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId)
  return plan === 'pro-plus'
}

/**
 * Check if user can use image generation (Pro+ only).
 */
export async function canUseImageGen(userId: string): Promise<boolean> {
  const result = await canUseProPlusFeature(userId)
  return result.allowed
}

/**
 * Check if user has at least basic Pro (unlimited, history, post to X, suggestions, priority).
 * Pro or Pro+ both qualify.
 */
export async function isPro(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId)
  return plan === 'pro' || plan === 'pro-plus'
}

// ============================================
// X (Twitter) Account helpers (tokens in privateMetadata for security)
// Used by Pro+ Scheduler feature
// ============================================

export interface XTokenRefreshResult {
  accessToken: string
  refreshToken?: string
  expiresAt: string
}

const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token'

/**
 * Refresh an X access token using the stored refresh_token.
 */
export async function refreshXToken(refreshToken: string): Promise<XTokenRefreshResult | null> {
  // Support both common naming: X_API_KEY / X_API_SECRET (preferred) or legacy X_CLIENT_ID / X_CLIENT_SECRET
  const clientId = process.env.X_API_KEY || process.env.X_CLIENT_ID
  const clientSecret = process.env.X_API_SECRET || process.env.X_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('X_API_KEY or X_API_SECRET (or X_CLIENT_ID/X_CLIENT_SECRET) missing for token refresh')
    return null
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const res = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basic}`,
      },
      body: body.toString(),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('X token refresh failed:', res.status, errText)
      return null
    }

    const data = await res.json()
    const expiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt,
    }
  } catch (e) {
    console.error('X refresh token error:', e)
    return null
  }
}

/**
 * Get the user's connected X account (from privateMetadata).
 */
export async function getXAccount(userId: string): Promise<XAccount | null> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const acct = (user.privateMetadata?.xAccount as XAccount | undefined) || null
    return acct
  } catch (error) {
    console.error('Failed to get X account:', error)
    return null
  }
}

/**
 * Save / update X account connection in privateMetadata.
 */
export async function saveXAccount(userId: string, account: XAccount): Promise<void> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        ...user.privateMetadata,
        xAccount: account,
      },
    })
  } catch (error) {
    console.error('Failed to save X account:', error)
  }
}

/**
 * Remove X account (disconnect).
 */
export async function disconnectXAccount(userId: string): Promise<void> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const { xAccount, ...rest } = user.privateMetadata || {}
    await client.users.updateUserMetadata(userId, {
      privateMetadata: rest,
    })
  } catch (error) {
    console.error('Failed to disconnect X account:', error)
  }
}

/**
 * Get a valid (non-expired) X access token for a user. Auto-refreshes if needed.
 */
export async function getValidXAccessToken(userId: string): Promise<string | null> {
  const acct = await getXAccount(userId)
  if (!acct?.accessToken) return null

  if (acct.expiresAt && new Date(acct.expiresAt) > new Date()) {
    return acct.accessToken
  }

  if (!acct.refreshToken) return null

  const refreshed = await refreshXToken(acct.refreshToken)
  if (refreshed) {
    const updated: XAccount = {
      ...acct,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    }
    await saveXAccount(userId, updated)
    return refreshed.accessToken
  }

  return null
}

// ============================================
// Scheduled Posts (publicMetadata) - Pro+ only feature
// ============================================

const MAX_SCHEDULED = 50

/**
 * Get all scheduled posts for user (newest first or as stored).
 */
export async function getScheduledPosts(userId: string): Promise<ScheduledPost[]> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const posts = (user.publicMetadata?.scheduledPosts as ScheduledPost[]) || []
    return posts
  } catch (error) {
    console.error('Failed to get scheduled posts:', error)
    return []
  }
}

/**
 * Add a new scheduled post. Generates id, caps list.
 */
export async function addScheduledPost(userId: string, post: Omit<ScheduledPost, 'id'>): Promise<ScheduledPost | null> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const existing: ScheduledPost[] = (user.publicMetadata?.scheduledPosts as ScheduledPost[]) || []

    const newPost: ScheduledPost = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      ...post,
    }

    // Keep most recent, cap total
    const updated = [newPost, ...existing].slice(0, MAX_SCHEDULED)

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        scheduledPosts: updated,
      },
    })

    return newPost
  } catch (error) {
    console.error('Failed to add scheduled post:', error)
    return null
  }
}

/**
 * Update a specific scheduled post by id (e.g. status after publish).
 */
export async function updateScheduledPost(userId: string, postId: string, updates: Partial<ScheduledPost>): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const existing: ScheduledPost[] = (user.publicMetadata?.scheduledPosts as ScheduledPost[]) || []
    let found = false

    const updated = existing.map((p) => {
      if (p.id === postId) {
        found = true
        return { ...p, ...updates }
      }
      return p
    })

    if (!found) return false

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        scheduledPosts: updated,
      },
    })

    return true
  } catch (error) {
    console.error('Failed to update scheduled post:', error)
    return false
  }
}

/**
 * Remove a scheduled post (used for cancel or cleanup).
 */
export async function removeScheduledPost(userId: string, postId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const existing: ScheduledPost[] = (user.publicMetadata?.scheduledPosts as ScheduledPost[]) || []
    const updated = existing.filter((p) => p.id !== postId)

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        scheduledPosts: updated,
      },
    })

    return true
  } catch (error) {
    console.error('Failed to remove scheduled post:', error)
    return false
  }
}

/**
 * Helper used by cron: get due pending scheduled posts across a user.
 * (Cron itself is daily on Hobby; see vercel.json)
 */
export function filterDuePending(posts: ScheduledPost[]): ScheduledPost[] {
  const now = new Date()
  return posts.filter((p) => p.status === 'pending' && new Date(p.scheduledFor) <= now)
}

// ============================================
// Saved Templates (Pro users can save private ones, everyone sees library)
// ============================================

const MAX_TEMPLATES = 30

/**
 * Get user's saved private templates from publicMetadata.
 */
export async function getUserTemplates(userId: string): Promise<Template[]> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return (user.publicMetadata?.templates as Template[]) || []
  } catch {
    return []
  }
}

/**
 * Save a new private template for the user.
 */
export async function saveUserTemplate(userId: string, tpl: Omit<Template, 'id' | 'savedAt'>): Promise<Template | null> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const existing: Template[] = (user.publicMetadata?.templates as Template[]) || []

    const newTpl: Template = {
      id: 'tpl_' + Date.now().toString(36),
      savedAt: new Date().toISOString(),
      ...tpl,
    }

    const updated = [newTpl, ...existing].slice(0, MAX_TEMPLATES)
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        templates: updated,
      },
    })
    return newTpl
  } catch (e) {
    console.error('saveUserTemplate failed', e)
    return null
  }
}

/**
 * Delete one of the user's templates.
 */
export async function deleteUserTemplate(userId: string, templateId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const existing: Template[] = (user.publicMetadata?.templates as Template[]) || []
    const updated = existing.filter((t) => t.id !== templateId)
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        templates: updated,
      },
    })
    return true
  } catch {
    return false
  }
}

/**
 * Lightweight analytics: increment "threads posted to X" counter (used by scheduler + Post to X for Pro+).
 */
export async function incrementPostedCount(userId: string, by: number = 1) {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const current = (user.publicMetadata?.postedCount as number) || 0
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        postedCount: current + by,
        lastPostedAt: new Date().toISOString(),
      },
    })
  } catch (e) {
    // non fatal
  }
}

// ============================================
// One-time Pro+ Trial (strict one use per signed-in non-Pro+ user)
// For AI Images + Scheduler
// ============================================

/**
 * Check if user has used their one-time Pro+ trial.
 */
export async function hasUsedProPlusTrial(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return !!(user.publicMetadata?.hasUsedProPlusTrial)
  } catch {
    return false
  }
}

/**
 * Mark that the user has used their one-time Pro+ trial.
 */
export async function markProPlusTrialUsed(userId: string): Promise<void> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        hasUsedProPlusTrial: true,
      },
    })
  } catch (e) {
    console.error('Failed to mark Pro+ trial as used:', e)
  }
}

/**
 * Check if user can use a Pro+ only feature (Images or Scheduler).
 * Returns { allowed, isTrial } — if isTrial, this use will consume the one-time trial.
 */
export async function canUseProPlusFeature(userId: string): Promise<{ allowed: boolean; isTrial: boolean }> {
  const plan = await getUserPlan(userId)
  if (plan === 'pro-plus') {
    return { allowed: true, isTrial: false }
  }
  const usedTrial = await hasUsedProPlusTrial(userId)
  if (usedTrial) {
    return { allowed: false, isTrial: false }
  }
  return { allowed: true, isTrial: true }
}
