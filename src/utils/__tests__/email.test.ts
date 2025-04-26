import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as emailUtils from '../email.js'
import {
  formatChallengeEmail,
  formatFeedbackEmail,
  formatDigestEmail,
} from '../email.js'
import type {
  Challenge,
  Feedback,
  Config,
  EmailStyle,
  SubjectArea,
  MentorProfile,
  Schedule
} from '../../types.js'
import type { DigestData } from '../email.js'

// Mock Resend and keep a reference to the mock send function
const mockResendSend = vi.fn().mockResolvedValue({ id: 'mock-email-id' });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend
    }
  }))
}))

// Import Resend *after* the mock definition
import { Resend } from 'resend';

describe('Email Utilities', () => {
  const mockConfig: Config = {
    userEmail: 'test@example.com',
    githubUsername: 'testuser',
    subjectAreas: ['programming', 'devops', 'networking', 'security', 'cloud', 'databases'] as SubjectArea[],
    topics: {
      programming: ['typescript', 'testing'],
      devops: ['docker', 'github-actions'],
      networking: ['tcp-ip', 'dns'],
      security: ['encryption', 'authentication'],
      cloud: ['aws', 'azure'],
      databases: ['sql', 'nosql']
    } as Record<SubjectArea, string[]>,
    difficulty: 5,
    sessionLength: 60,
    mentorProfile: 'technical' as MentorProfile,
    emailStyle: 'technical' as EmailStyle,
    schedule: 'weekly' as Schedule,
    archive: {
      enabled: true,
      challengeRetentionDays: 30,
      submissionRetentionDays: 30,
      letterRetentionDays: 30,
      detailedStatsRetentionDays: 90,
      compactSummariesAutomatically: true,
      maxActiveFilesPerType: 100
    }
  }

  const mockChallenge: Challenge = {
    id: 'challenge-1',
    title: 'Test Challenge',
    description: 'A test challenge description',
    requirements: ['Requirement 1', 'Requirement 2'],
    examples: ['Example 1', 'Example 2'],
    hints: ['Hint 1'],
    difficulty: 3,
    topics: ['typescript', 'testing'],
    createdAt: new Date().toISOString()
  }

  const mockFeedback: Feedback = {
    submissionId: 'submission-1',
    strengths: ['Good code organization'],
    weaknesses: ['Could improve error handling'],
    suggestions: ['Consider adding try-catch blocks'],
    score: 85,
    improvementPath: 'Focus on error handling patterns',
    createdAt: new Date().toISOString()
  }

  const mockDigest: DigestData = {
    type: 'weekly',
    period: {
      start: '2024-03-01',
      end: '2024-03-07'
    },
    stats: {
      challengesCompleted: 5,
      averageScore: 87.5,
      topicsProgress: {
        typescript: 0.75,
        testing: 0.6
      },
      strengths: ['TypeScript fundamentals', 'Code organization'],
      areasForImprovement: ['Error handling', 'Testing coverage']
    },
    recommendations: ['Practice more error handling scenarios'],
    nextSteps: ['Complete the error handling challenge']
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockResendSend.mockClear();
    mockResendSend.mockResolvedValue({ id: 'mock-email-id' });
  })

  describe('formatChallengeEmail', () => {
    it('should format challenge email correctly', async () => {
      const result = await formatChallengeEmail(mockChallenge, 'technical')
      
      expect(result.subject).toBe('New Challenge: Test Challenge')
      expect(result.html).toContain('Test Challenge')
      expect(result.html).toContain('A test challenge description')
      expect(result.html).toContain('Requirement 1')
      expect(result.html).toContain('Example 1')
      expect(result.html).toContain('Hint 1')
    })
  })

  describe('formatFeedbackEmail', () => {
    it('should format feedback email correctly', async () => {
      const result = await formatFeedbackEmail(
        mockFeedback,
        { challengeId: mockChallenge.id },
        mockChallenge,
        'technical'
      )
      
      expect(result.subject).toBe('Feedback: Test Challenge')
      expect(result.html).toContain('Score: 85/100')
      expect(result.html).toContain('Good code organization')
      expect(result.html).toContain('Could improve error handling')
      expect(result.html).toContain('Consider adding try-catch blocks')
    })
  })

  describe('formatDigestEmail', () => {
    it('should format digest email correctly', async () => {
      const result = await formatDigestEmail(mockDigest, 'technical')
      
      expect(result.subject).toBe('Your Weekly TechDeck Academy Progress Report')
      expect(result.html).toContain('Weekly Learning Digest')
      expect(result.html).toContain('Challenges Completed: 5')
      expect(result.html).toContain('Average Score: 87.5/100')
      expect(result.html).toContain('typescript: 75.0% complete')
    })
  })

  describe('sendEmailWithRetry', () => {
    it('should retry sending email on failure', async () => {
      const mockError = new Error('Rate limit exceeded')
      const sendEmailSpy = vi.spyOn(emailUtils, 'sendEmail')
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(undefined)

      const content = {
        subject: 'Test Email',
        html: '<p>Test content</p>'
      }

      await emailUtils.sendEmailWithRetry(mockConfig, content)
      expect(sendEmailSpy).toHaveBeenCalledTimes(3)
    })

    it('should throw error after max retries', async () => {
      const mockError = new Error('Rate limit exceeded')
      vi.spyOn(emailUtils, 'sendEmail')
        .mockRejectedValue(mockError)

      const content = {
        subject: 'Test Email',
        html: '<p>Test content</p>'
      }

      await expect(emailUtils.sendEmailWithRetry(mockConfig, content))
        .rejects
        .toThrow('Failed to send email after 3 attempts')
    })
  })

  describe('sendEmail', () => {
    it('should validate email content before sending', async () => {
      await expect(emailUtils.sendEmail(mockConfig, {
        subject: '',
        html: '<p>Test</p>'
      })).rejects.toThrow('Email subject is required')

      await expect(emailUtils.sendEmail(mockConfig, {
        subject: 'Test',
        html: ''
      })).rejects.toThrow('Email HTML content is required')

      await expect(emailUtils.sendEmail(mockConfig, {
        subject: 'A'.repeat(101),
        html: '<p>Test</p>'
      })).rejects.toThrow('Email subject is too long')
    })

    it('should handle specific error cases', async () => {
      mockResendSend.mockRejectedValueOnce(new Error('rate limit exceeded'))
      await expect(emailUtils.sendEmail(mockConfig, {
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('Email rate limit exceeded')

      mockResendSend.mockRejectedValueOnce(new Error('invalid email'))
      await expect(emailUtils.sendEmail(mockConfig, {
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('Invalid email address')

      mockResendSend.mockRejectedValueOnce(new Error('unauthorized'))
      await expect(emailUtils.sendEmail(mockConfig, {
        subject: 'Test',
        html: '<p>Test</p>'
      })).rejects.toThrow('Invalid API key')
    })
  })
}) 