import { clerkClient } from '@clerk/nextjs/server'
import type { GenerationRecord, Thread } from './types'

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
