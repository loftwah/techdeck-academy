import { z } from 'zod'
import { Config, MentorProfile, EmailStyle, Schedule, SubjectArea } from './types.js'

// Environment variable validation schema
const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
})

// Parse and validate environment variables
const env = envSchema.parse(process.env)

// Default configuration
export const config: Config = {
  // Personal information (should be overridden by user)
  userEmail: 'user@example.com',
  githubUsername: 'username',

  // Learning preferences
  subjectAreas: ['programming', 'devops'],
  topics: {
    programming: ['typescript', 'javascript', 'python'],
    devops: ['docker', 'kubernetes', 'ci-cd'],
    networking: ['tcp-ip', 'http', 'dns'],
    security: ['cryptography', 'web-security', 'authentication'],
    cloud: ['aws', 'azure', 'gcp'],
    databases: ['sql', 'nosql', 'graph-databases']
  },
  difficulty: 5,
  sessionLength: 60,

  // Style preferences
  mentorProfile: 'supportive',
  emailStyle: 'casual',

  // Schedule
  schedule: 'threePerWeek',

  // Archive settings
  archive: {
    enabled: true,
    challengeRetentionDays: 30,
    submissionRetentionDays: 60,
    letterRetentionDays: 90,
    detailedStatsRetentionDays: 180,
    compactSummariesAutomatically: true,
    maxActiveFilesPerType: 100
  }
}

// Export validated environment variables
export const environment = {
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  RESEND_API_KEY: env.RESEND_API_KEY,
} 