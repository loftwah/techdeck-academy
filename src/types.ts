import type { PathLike } from 'node:fs';

// Mentor and Email Types
export interface MentorProfile {
  name: string;
  description: string;
  style: string;
  tone: string;
  expertise: string[];
  personaPrompt: string;
}

export type EmailStyle = 'casual' | 'formal' | 'technical' | 'supportive'
export type Schedule = 'daily' | 'threePerWeek' | 'weekly' | 'manual'

// Core Types
export interface Challenge {
  id: string
  title: string
  description: string
  type: string
  requirements?: string[]
  examples?: string[]
  hints?: string[]
  difficulty: number
  topics: string[]
  createdAt: string
}

export interface Submission {
  challengeId: string
  content: string
  submittedAt: string
  filePath?: string
}

export interface Feedback {
  submissionId: string
  strengths?: string[]
  weaknesses?: string[]
  suggestions?: string[]
  improvementPath?: string
  createdAt: string
}

// Represents the student's learning state and progress
export interface StudentProfile {
  userId: string // Could be GitHub username or a unique ID
  name: string // Added name field
  currentSkillLevel: number // Overall level (1-10) - reflects config.difficulty
  completedChallenges?: number // Made optional
  lastUpdated: string // ISO date string
  status: 'awaiting_introduction' | 'active' | 'paused' | 'completed' // Learning status
  topicLevels?: Record<string, { currentLevel: number }> // Reflects config.topics
  currentChallengeId?: string; // Added missing optional field based on schema usage
}

// Configuration Types
export interface TopicConfig {
  level: number; // 1-10 indicating user's current level
  relatedTopics?: string[]; // Related topics that might be relevant
  description?: string; // Optional description for AI context
}

// Add ChallengeType definition
export type ChallengeType = 'coding' | 'iac' | 'question' | 'mcq' | 'design' | 'casestudy' | 'project';

export interface Config {
  // Personal information
  userEmail: string
  githubUsername: string

  // Learning preferences
  topics: Record<string, { currentLevel: number }>;
  difficulty: number // 1-10
  sessionLength: number // minutes
  preferredChallengeTypes?: ChallengeType[]; // Added optional array
  introductionSubmitted?: boolean; // Track if intro is done

  // Style preferences
  mentorProfile: string // filename in src/profiles/
  emailStyle: EmailStyle

  // Schedule
  schedule: {
    challengeFrequency: Schedule
  }

  // Archive settings
  archive: {
    enabled: boolean
    maxAgeDays: number // Rotate files older than this
  }

  notifications: {
    emailMentions: boolean
    emailErrors: boolean
  }
}

export interface ArchiveConfig {
  enabled: boolean
  challengeRetentionDays: number
  submissionRetentionDays: number
  letterRetentionDays: number
  detailedStatsRetentionDays: number
  compactSummariesAutomatically: boolean
  maxActiveFilesPerType: number
}

// Stats and Summary Types
export interface Stats {
  meta: {
    lastCompaction: string
    version: number
    retentionPolicy: {
      daily: number
      weekly: number
      monthly: number
    }
  }
  challenges: {
    daily: DailyStats[]
    weekly: WeeklyStats[]
    monthly: MonthlyStats[]
  }
  submissions: {
    daily: DailyStats[]
    weekly: WeeklyStats[]
    monthly: MonthlyStats[]
  }
  topics: Record<string, TopicProgress>
  activity: ActivityPattern
}

interface DailyStats {
  date: string
  count: number
  details: Record<string, unknown>
}

interface WeeklyStats {
  weekStart: string
  weekEnd: string
  count: number
  summary: Record<string, unknown>
}

interface MonthlyStats {
  month: string
  count: number
  summary: Record<string, unknown>
}

interface TopicProgress {
  completedChallenges: number
  lastActivity: string
}

interface ActivityPattern {
  daysActive: number
  streakCurrent: number
  streakLongest: number
  preferredTimes: string[]
  lastActivity?: string
}

export interface Summary {
  meta: {
    lastUpdated: string
    activeCount: number
    archivedCount: number
  }
  activeChallenges: Challenge[]
  archivedChallenges: ArchivedChallenge[]
}

interface ArchivedChallenge {
  id: string
  title: string
  createdAt: string
  archivedAt: string
}

export interface ProgressReport {
  period: 'weekly' | 'monthly' | 'quarterly';
  startDate: string;
  endDate: string;
  summary: string;
  strengths: string[];
  areasForImprovement: string[];
  suggestedNextSteps: string[];
  challengesCompleted: number;
}

export interface LetterResponse {
  content: string;
  insights: LetterInsights;
}

export interface LetterInsights {
  strengths?: string[]; // Optional as insights might not always be present
  weaknesses?: string[]; // Optional
  topics?: string[]; // Optional
  sentiment?: string; // Optional analysis - Changed from enum
  skillLevelAdjustment?: number; // e.g., +0.1 or -0.2 based on letter content
  flags?: string[]; // e.g., 'confused', 'motivated', 'needs_clarification'
} 