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
  userEmail: 'dean@deanlofts.xyz',
  githubUsername: 'loftwah',

  // Learning preferences
  subjectAreas: ['programming', 'devops'],
  topics: {
    programming: {
      'typescript': { level: 3, relatedTopics: ['javascript', 'type-systems'] },
      'javascript': { level: 4 },
      'python': { level: 2, relatedTopics: ['scripting', 'data-science'] }
    },
    devops: {
      'docker': { level: 2, relatedTopics: ['containerization'] },
      'kubernetes': { level: 1, relatedTopics: ['docker', 'orchestration'] },
      'ci-cd': { level: 3, relatedTopics: ['github-actions', 'jenkins'] }
    },
    aws: {
      'ec2': { level: 3 },
      'rds': { level: 2, relatedTopics: ['databases'] },
      's3': { level: 4 }
    }
    // Add other subject areas and topics as needed
  },
  difficulty: 5,
  sessionLength: 60,

  // Style preferences
  mentorProfile: 'linus', // Default to linus for now
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