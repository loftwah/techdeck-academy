// Mentor and Email Types
export type MentorProfile = 'linus' | 'supportive' | 'technical'
export type EmailStyle = 'casual' | 'formal' | 'technical'
export type Schedule = 'daily' | 'threePerWeek' | 'weekly'
export type SubjectArea = 'programming' | 'devops' | 'networking' | 'security' | 'cloud' | 'databases'

// Core Types
export interface Challenge {
  id: string
  title: string
  description: string
  requirements: string[]
  examples: string[]
  hints?: string[]
  difficulty: number
  topics: string[]
  createdAt: string
}

export interface Submission {
  challengeId: string
  content: string
  submittedAt: string
  filePath: string
}

export interface Feedback {
  submissionId: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  score: number // 0-100
  improvementPath: string
  createdAt: string
}

export interface StudentProfile {
  strengths: string[]
  weaknesses: string[]
  currentSkillLevel: number
  recommendedTopics: string[]
  completedChallenges: number
  averageScore: number
  topicProgress: Record<string, number>
  notes: string
  lastUpdated: string
}

// Configuration Types
export interface Config {
  // Personal information
  userEmail: string
  githubUsername: string

  // Learning preferences
  subjectAreas: SubjectArea[]
  topics: Record<SubjectArea, string[]>
  difficulty: number // 1-10
  sessionLength: number // minutes

  // Style preferences
  mentorProfile: MentorProfile
  emailStyle: EmailStyle

  // Schedule
  schedule: Schedule

  // Archive settings
  archive: ArchiveConfig
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
  scores: ScoreProgression[]
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
  averageScore: number
  lastActivity: string
}

interface ScoreProgression {
  date: string
  score: number
  challengeId: string
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