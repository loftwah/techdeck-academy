import { z } from 'zod'
import { Config, MentorProfile, EmailStyle, Schedule, ChallengeType } from './types.js'

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
  topics: {
    // Programming
    'typescript': { currentLevel: 3 },
    'javascript': { currentLevel: 4 },
    'python': { currentLevel: 2 },
    // Add others like:
    // 'ruby': { currentLevel: 2 },
    // 'golang': { currentLevel: 2 },
    
    // DevOps / Infra
    'docker': { currentLevel: 2 },
    'kubernetes': { currentLevel: 1 },
    'ci-cd': { currentLevel: 3 },
    'terraform': { currentLevel: 2 },
    'github-actions': { currentLevel: 3 },
    'cloudflare': { currentLevel: 2 },
    'scaling-strategies': { currentLevel: 1 },
    
    // AWS
    'aws-ec2': { currentLevel: 3 },
    'aws-rds': { currentLevel: 2 },
    'aws-s3': { currentLevel: 4 },
    // 'aws-elasticache': { currentLevel: 2 },

    // Security
    'security-hardening': { currentLevel: 2 },
    'aws-iam-policies': { currentLevel: 2 }
    // Add any other topic freely
  },
  difficulty: 6,
  sessionLength: 60,
  preferredChallengeTypes: ['coding', 'question', 'iac', 'mcq', 'design', 'casestudy'] as ChallengeType[],
  introductionSubmitted: false,

  // Style preferences
  mentorProfile: 'linus',
  emailStyle: 'technical',

  // Schedule
  schedule: {
    challengeFrequency: 'threePerWeek',
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