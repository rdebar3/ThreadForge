import { clerkClient } from '@clerk/nextjs/server'
import type { GenerationRecord, Thread, XAccount, ScheduledPost, Template, ShowcasePost } from './types'

/**
 * Increment the total generations count for a user in Clerk publicMetadata.
 * Used for lightweight analytics.
 */
export async function incrementUserGenerations(userId: string, count: number = 1) {
  try {
    await cleanupUserMetadata(userId)

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
 * Only call for Pro users. Keeps only the most recent 10 entries (after cleanup).
 */
export async function saveGenerationToHistory(userId: string, record: Omit<GenerationRecord, 'id'>): Promise<void> {
  try {
    await cleanupUserMetadata(userId)

    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    const existing: GenerationRecord[] = (user.publicMetadata?.generationHistory as GenerationRecord[]) || []

    const newRecord: GenerationRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      ...record,
    }

    const updated = [newRecord, ...existing].slice(0, MAX_GENERATION_HISTORY)

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
const X_TWEETS_URL = 'https://api.x.com/2/tweets'
const X_MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json'

/**
 * Refresh an X access token using the stored refresh_token.
 */
export async function refreshXToken(refreshToken: string): Promise<XTokenRefreshResult | null> {
  // Support both common naming: X_API_KEY / X_API_SECRET (preferred) or legacy X_CLIENT_ID / X_CLIENT_SECRET
  const clientId = process.env.X_API_KEY || process.env.X_CLIENT_ID
  const clientSecret = process.env.X_API_SECRET || process.env.X_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[X OAuth] X_API_KEY or X_API_SECRET (preferred; or X_CLIENT_*) missing for token refresh. Scheduler posting may fail.')
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

/**
 * Uploads an image (from URL) to X for use in tweets.
 * Downloads the image bytes server-side, then POSTs multipart to X's media upload endpoint
 * using the user's access token (Bearer). Returns the media_id_string for use in /2/tweets media param.
 * Supports common formats returned by xAI (and demo picsum). Simple upload for images (<~5MB).
 */
export async function uploadMediaToX(accessToken: string, imageUrl: string): Promise<string> {
  console.log(`[uploadMediaToX] Starting: fetch image from ${imageUrl ? imageUrl.substring(0, 80) + '...' : '(no url)'}`)
  // 1. Fetch the image bytes (works for https://picsum.photos/... and xAI image URLs)
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) {
    console.error(`[uploadMediaToX] Image fetch failed: ${imgRes.status} for ${imageUrl}`)
    throw new Error(`Failed to fetch image for X upload: ${imgRes.status} ${imageUrl}`)
  }
  const buffer = await imgRes.arrayBuffer()
  const mediaData = Buffer.from(buffer).toString('base64')
  console.log(`[uploadMediaToX] Fetched image ok, raw bytes=${buffer.byteLength}, base64Len≈${Math.round(mediaData.length/1024)}KB. Preparing upload...`)

  // Use base64 + media_data + urlencoded for maximum server compatibility (avoids Blob/FormData quirks in some runtimes)
  const body = new URLSearchParams({ media_data: mediaData })

  // 2. Upload to X (v1.1 media endpoint still required for attaching photos to tweets)
  console.log(`[uploadMediaToX] POSTing to X media upload endpoint with Bearer token...`)
  const uploadRes = await fetch(X_MEDIA_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!uploadRes.ok) {
    const errText = await uploadRes.text()
    console.error(`[uploadMediaToX] X upload HTTP error ${uploadRes.status}: ${errText.substring(0, 300)}`)
    throw new Error(`X media upload failed (${uploadRes.status}): ${errText.substring(0, 200)}`)
  }

  const mediaJson = await uploadRes.json()
  console.log(`[uploadMediaToX] X response keys: ${Object.keys(mediaJson || {}).join(',')}`)
  const mediaId = mediaJson?.media_id_string || mediaJson?.media_id
  if (!mediaId) {
    console.error(`[uploadMediaToX] No media id in response: ${JSON.stringify(mediaJson).substring(0,200)}`)
    throw new Error('X media upload returned no media_id_string')
  }
  console.log(`[uploadMediaToX] SUCCESS, media_id=${mediaId}`)
  return String(mediaId)
}

/**
 * Posts a full thread as a connected reply chain on X using the user's access token.
 * Uses reply_settings on root tweet and in_reply_to_tweet_id for subsequent tweets.
 * Supports optional media per tweet via items form (or legacy string[] for text-only callers like cron).
 * Returns array of created tweet IDs.
 */
export async function postThreadToX(
  accessToken: string,
  tweetsOrItems: string[] | Array<{ text: string; mediaIds?: string[] }>
): Promise<string[]> {
  const postedIds: string[] = []
  let inReplyTo: string | null = null

  // Normalize input: support legacy string[] (text only, e.g. cron/scheduler) and new richer form for images
  const items: Array<{ text: string; mediaIds?: string[] }> = Array.isArray(tweetsOrItems) && tweetsOrItems.length > 0 && typeof tweetsOrItems[0] === 'string'
    ? (tweetsOrItems as string[]).map(t => ({ text: t }))
    : (tweetsOrItems as Array<{ text: string; mediaIds?: string[] }>)

  for (const item of items) {
    const text = (item.text || '').trim().slice(0, 280)
    if (!text) continue

    const payload: any = { text }
    if (item.mediaIds && item.mediaIds.length > 0) {
      // Attach media (images) to this specific tweet in the chain. X supports 1-4 per tweet.
      payload.media = { media_ids: item.mediaIds }
    }
    if (!inReplyTo) {
      // Set reply settings on the root tweet of the chain.
      // Valid values per X API: following, mentionedUsers, subscribers, verified
      // "following" is appropriate for public threads (anyone who follows you can reply).
      payload.reply_settings = 'following'
    } else {
      payload.reply = { in_reply_to_tweet_id: inReplyTo }
    }

    const res = await fetch(X_TWEETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      if (errText.includes('CreditsDepleted') || /credits? ?deplet/i.test(errText) || errText.toLowerCase().includes('credit')) {
        throw new Error('CreditsDepleted')
      }
      // Better error handling: try to parse X API JSON error response for clearer messages
      let friendlyError = `X API error ${res.status}: ${errText.substring(0, 180)}`
      try {
        const parsed = JSON.parse(errText)
        if (parsed.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          const firstErr = parsed.errors[0]
          const msg = firstErr.message || firstErr.detail || JSON.stringify(firstErr)
          friendlyError = `X API error ${res.status}: ${msg}`
          // Also surface specific codes like invalid reply_settings etc.
          if (firstErr.code) {
            friendlyError += ` (code: ${firstErr.code})`
          }
        } else if (parsed.detail) {
          friendlyError = `X API error ${res.status}: ${parsed.detail}`
        }
      } catch (e) {
        // not JSON, use raw text (already truncated)
      }
      throw new Error(friendlyError)
    }

    const json = await res.json()
    const id = json?.data?.id
    if (!id) throw new Error('X returned no tweet id')

    postedIds.push(id)
    inReplyTo = id
  }

  if (postedIds.length === 0) {
    throw new Error('No tweets were posted')
  }

  return postedIds
}

// ============================================
// Scheduled Posts (publicMetadata) - Pro+ only feature
// ============================================

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
    await cleanupUserMetadata(userId)

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
// Aggressive Metadata Cleanup (to stay under Clerk's ~8KB publicMetadata limit)
// ============================================

const MAX_GENERATION_HISTORY = 5
const MAX_SHOWCASE_POSTS = 3
const MAX_SCHEDULED = 5
const MAX_TEMPLATES = 5

/**
 * Aggressively prunes user publicMetadata to prevent 8KB Clerk limit errors (422).
 * Keeps only the most recent N entries for each category (newest first).
 * Also prunes any other large arrays in publicMetadata.
 * Called before any metadata updates.
 */
export async function cleanupUserMetadata(userId: string): Promise<void> {
  console.log(`[clerk] cleanupUserMetadata running for user ${userId} - pruning old data`)
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const metadata = { ...(user.publicMetadata || {}) }
    let changed = false

    // generationHistory - keep most recent
    const genHistory: GenerationRecord[] = (metadata.generationHistory as GenerationRecord[]) || []
    if (genHistory.length > MAX_GENERATION_HISTORY) {
      metadata.generationHistory = genHistory.slice(0, MAX_GENERATION_HISTORY)
      changed = true
    }

    // showcasePosts
    const showcase: ShowcasePost[] = (metadata.showcasePosts as ShowcasePost[]) || []
    if (showcase.length > MAX_SHOWCASE_POSTS) {
      metadata.showcasePosts = showcase.slice(0, MAX_SHOWCASE_POSTS)
      changed = true
    }

    // scheduledPosts
    const scheduled: ScheduledPost[] = (metadata.scheduledPosts as ScheduledPost[]) || []
    if (scheduled.length > MAX_SCHEDULED) {
      metadata.scheduledPosts = scheduled.slice(0, MAX_SCHEDULED)
      changed = true
    }

    // templates
    const templates: Template[] = (metadata.templates as Template[]) || []
    if (templates.length > MAX_TEMPLATES) {
      metadata.templates = templates.slice(0, MAX_TEMPLATES)
      changed = true
    }

    // Prune ANY other large arrays in publicMetadata (nuclear option)
    for (const key of Object.keys(metadata)) {
      if (key === 'generationHistory' || key === 'showcasePosts' || key === 'scheduledPosts' || key === 'templates') continue;
      const val = metadata[key];
      if (Array.isArray(val) && val.length > 5) {
        metadata[key] = val.slice(0, 5); // keep most recent 5 for unknown arrays
        changed = true;
      }
    }

    if (changed) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: metadata,
      })
      console.log('[clerk] cleanupUserMetadata pruned data for user=', userId)
    }
  } catch (error) {
    console.error('Failed to cleanup user metadata:', error)
    // non-fatal, do not block updates
  }
}

// ============================================
// Saved Templates (Pro users can save private ones, everyone sees library)
// ============================================

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
    await cleanupUserMetadata(userId)

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
    await cleanupUserMetadata(userId)

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

// ============================================
// Community Showcase (public feed, simple submissions)
// Uses per-user publicMetadata.showcasePosts (capped) + likedShowcaseIds
// Aggregated via getUserList for feed (fine for early <100 creators)
// ============================================

export interface EnrichedShowcasePost extends ShowcasePost {
  authorName: string
  likedByMe?: boolean
}

/**
 * Submit a thread to the public community showcase.
 * Stored in the submitting user's publicMetadata.
 */
export async function submitShowcasePost(
  userId: string,
  data: { title: string; tweets: string[]; images?: any[] }
): Promise<ShowcasePost | null> {
  try {
    await cleanupUserMetadata(userId)

    const client = await clerkClient()
    const user = await client.users.getUser(userId)

    console.log('[clerk] submitShowcasePost START | user=', userId, '| titleLen=', data.title?.length || 0)

    const existing: ShowcasePost[] = (user.publicMetadata?.showcasePosts as ShowcasePost[]) || []

    // Defensive image cleaning
    let cleanImages: any[] = []
    if (Array.isArray(data.images) && data.images.length > 0) {
      cleanImages = data.images
        .filter((img: any) => img && typeof img.url === 'string' && img.url.length > 10)
        .map((img: any) => ({
          url: String(img.url),
          style: String(img.style || 'cinematic'),
          revisedPrompt: (img.revisedPrompt || img.revised_prompt) ? String(img.revisedPrompt || img.revised_prompt) : undefined,
        }))
        .slice(0, 2)
    }

    const newPost: ShowcasePost = {
      id: 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      title: (data.title || 'Untitled Thread').trim().slice(0, 100),
      tweets: Array.isArray(data.tweets) ? data.tweets.slice(0, 8) : [],
      images: cleanImages,
      likes: 0,
      createdAt: new Date().toISOString(),
      userId: userId,
    }

    const updatedPosts = [newPost, ...existing].slice(0, MAX_SHOWCASE_POSTS)

    // Ultra safe + minimal metadata update
    const safePublicMetadata = JSON.parse(JSON.stringify({
      ...user.publicMetadata,
      showcasePosts: updatedPosts,
    }))

    await client.users.updateUserMetadata(userId, {
      publicMetadata: safePublicMetadata,
    })

    console.log('[clerk] submitShowcasePost SUCCESS | postId=', newPost.id, '| totalShowcase=', updatedPosts.length)
    return newPost

  } catch (error: any) {
    console.error('[clerk] submitShowcasePost FAILED:', {
      message: error?.message,
      status: error?.status,
      clerkCode: error?.clerkError?.code,
      stack: error?.stack?.substring(0, 300)
    })
    return null
  }
}

/**
 * Get ALL public showcase posts by scanning recent users' metadata.
 * Enriches with authorName from Clerk profile.
 * If viewerUserId provided, marks likedByMe for that user.
 */
export async function getCommunityShowcasePosts(viewerUserId?: string | null): Promise<EnrichedShowcasePost[]> {
  try {
    const client = await clerkClient()

    // Get up to 200 users (early community is tiny; fine for hobby)
    const { data: users } = await client.users.getUserList({ limit: 200 })

    let myLiked: string[] = []
    if (viewerUserId) {
      try {
        const me = await client.users.getUser(viewerUserId)
        myLiked = (me.publicMetadata?.likedShowcaseIds as string[]) || []
      } catch {}
    }

    const all: EnrichedShowcasePost[] = []

    for (const u of users) {
      const theirPosts: ShowcasePost[] = (u.publicMetadata?.showcasePosts as ShowcasePost[]) || []
      if (!theirPosts.length) continue

      const authorName =
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
        (u.username as string | undefined) ||
        'Early Creator'

      for (const p of theirPosts) {
        if (!p || !p.id || !p.title) continue
        all.push({
          ...p,
          authorName,
          userId: p.userId || u.id,
          likedByMe: myLiked.includes(p.id),
        })
      }
    }

    // Default newest first (client can resort)
    all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    return all
  } catch (error) {
    console.error('Failed to load community showcase posts:', error)
    return []
  }
}

/**
 * Toggle like on a showcase post.
 * Finds the owner via scan (small N), updates likes count on owner, and viewer's liked list.
 */
export async function toggleShowcaseLike(viewerUserId: string, postId: string): Promise<{ likes: number; likedByMe: boolean } | null> {
  try {
    const client = await clerkClient()

    // Find owner + post by scanning (early app, N small)
    const { data: users } = await client.users.getUserList({ limit: 200 })
    let ownerId: string | null = null
    let postIndex = -1
    let currentLikes = 0

    for (const u of users) {
      const posts: ShowcasePost[] = (u.publicMetadata?.showcasePosts as ShowcasePost[]) || []
      const idx = posts.findIndex((pp) => pp.id === postId)
      if (idx >= 0) {
        ownerId = u.id
        postIndex = idx
        currentLikes = posts[idx].likes || 0
        break
      }
    }

    if (!ownerId || postIndex < 0) return null

    // Get viewer liked list
    const viewer = await client.users.getUser(viewerUserId)
    const likedIds: string[] = (viewer.publicMetadata?.likedShowcaseIds as string[]) || []
    const alreadyLiked = likedIds.includes(postId)

    const newLiked = alreadyLiked
      ? likedIds.filter((id) => id !== postId)
      : [...likedIds, postId]

    const newLikes = Math.max(0, currentLikes + (alreadyLiked ? -1 : 1))

    // Update owner post likes
    const owner = await client.users.getUser(ownerId)
    const ownerPosts: ShowcasePost[] = (owner.publicMetadata?.showcasePosts as ShowcasePost[]) || []
    if (ownerPosts[postIndex]) {
      ownerPosts[postIndex] = { ...ownerPosts[postIndex], likes: newLikes }
    }

    await client.users.updateUserMetadata(ownerId, {
      publicMetadata: {
        ...owner.publicMetadata,
        showcasePosts: ownerPosts,
      },
    })

    // Update viewer's liked list
    await client.users.updateUserMetadata(viewerUserId, {
      publicMetadata: {
        ...viewer.publicMetadata,
        likedShowcaseIds: newLiked,
      },
    })

    return { likes: newLikes, likedByMe: !alreadyLiked }
  } catch (error) {
    console.error('Failed to toggle showcase like:', error)
    return null
  }
}
