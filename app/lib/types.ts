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
