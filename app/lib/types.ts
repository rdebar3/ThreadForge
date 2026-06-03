export interface Thread {
  id: number;
  title: string;
  tweets: string[];
  images?: Array<{url: string, style: string, revisedPrompt?: string}>;
}

export interface GenerationRecord {
  id: string;
  topic: string;
  threads: Thread[];
  timestamp: string;
}

export interface XAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO string
  xUserId: string;
  username: string;
  connectedAt: string;
}

export interface ScheduledPost {
  id: string;
  title?: string;
  tweets: string[];
  scheduledFor: string; // ISO datetime string
  status: 'pending' | 'posted' | 'failed' | 'canceled';
  createdAt: string;
  postedAt?: string;
  xPostIds?: string[];
  error?: string;
}

export interface Template {
  id: string;
  title: string;
  tweets: string[];
  category?: string;
  savedAt: string;
}

/**
 * Community Showcase post - stored per-user in Clerk publicMetadata (showcasePosts),
 * aggregated server-side for public feed. Likes tracked with count + per-user liked list.
 */
export interface ShowcasePost {
  id: string;
  title: string;
  tweets: string[];
  images?: Array<{ url: string; style: string; revisedPrompt?: string }>;
  likes: number;
  createdAt: string;
  // Populated server-side when listing
  userId?: string;
}
