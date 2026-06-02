export interface Thread {
  id: number;
  title: string;
  tweets: string[];
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

export interface CommunityPost {
  id: number;
  title: string;
  snippet: string;
  author: string;
  avatar: string;
  likes: number; // initial likes count
  category: 'Launch' | 'Lesson' | 'Growth' | 'Story';
  imageId: number;
}
