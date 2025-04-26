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
      'typescript': { currentLevel: 3, lastTested: '' },
      'javascript': { currentLevel: 4, lastTested: '' },
      'python': { currentLevel: 2, lastTested: '' }
    },
    devops: {
      'docker': { currentLevel: 2, lastTested: '' },
      'kubernetes': { currentLevel: 1, lastTested: '' },
      'ci-cd': { currentLevel: 3, lastTested: '' }
    },
    aws: {
      'ec2': { currentLevel: 3, lastTested: '' },
      'rds': { currentLevel: 2, lastTested: '' },
      's3': { currentLevel: 4, lastTested: '' }
    }
    // Add other subject areas and topics as needed
  },
  difficulty: 5,
  sessionLength: 60,

  // Style preferences
  mentorProfile: 'linus',
  emailStyle: 'casual',

  // Schedule
  schedule: {
    challengeFrequency: 'threePerWeek',
    digestFrequency: 'weekly'
  },

  // Archive settings
  archive: {
    enabled: true,
    maxAgeDays: 90
  },

  // Notifications
  notifications: {
    emailMentions: true,
    emailErrors: true
  }
}

// Export validated environment variables
export const environment = {
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  RESEND_API_KEY: env.RESEND_API_KEY,
} 