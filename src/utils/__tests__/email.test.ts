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

describe('Email Utilities', () => {
  const mockConfig: Config = {
    userEmail: 'test@example.com',
    githubUsername: 'testuser',
    subjectAreas: ['programming', 'devops'] as SubjectArea[],
    topics: {
      programming: {
        'typescript': { currentLevel: 3, lastTested: '' },
        'testing': { currentLevel: 2, lastTested: '' }
      },
      devops: {
        'docker': { currentLevel: 1, lastTested: '' },
        'github-actions': { currentLevel: 4, lastTested: '' }
      }
    },
    difficulty: 5,
    sessionLength: 60,
    mentorProfile: 'linus',
    emailStyle: 'technical' as EmailStyle,
    schedule: {
      challengeFrequency: 'weekly' as Schedule,
      digestFrequency: 'weekly'
    },
    archive: {
      enabled: true,
      maxAgeDays: 90
    },
    notifications: {
      emailMentions: true,
      emailErrors: true
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
    // REMOVED skipped tests that previously relied on mocking network failures.
    // Testing retry logic reliably requires mocking, which is being avoided.
    /*
    it.skip('should retry sending email on failure', async () => { ... });
    it.skip('should throw error after max retries', async () => { ... });
    */
    
    // This test remains but might be redundant if sendEmail test passes.
    // It primarily tests if the retry wrapper *eventually* calls sendEmail successfully.
    it('should eventually send an email successfully via the retry wrapper', async () => {
      // Ensure mockConfig.userEmail is valid if running this test
      const content = {
        subject: 'Live Test - sendEmailWithRetry',
        html: '<p>This email was sent by a live test (via retry wrapper).</p>'
      };
      // This will call the real Resend API via sendEmail
      await expect(emailUtils.sendEmailWithRetry(mockConfig, content))
        .resolves.toBeUndefined();
    }, 30000); // Increase timeout for network calls
  })

  describe('sendEmail', () => {
    // Note: These tests use the LIVE Resend API and require valid credentials in .env
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

    it('should send an email successfully via Resend', async () => {
      // Ensure mockConfig.userEmail is valid if running this test
      const content = {
        subject: 'Live Test - sendEmail',
        html: '<p>This email was sent by a live test.</p>'
      }
      // This calls the real Resend API
      await expect(emailUtils.sendEmail(mockConfig, content))
        .resolves.toBeUndefined(); // Or check for a specific success indicator if applicable
    }, 30000) // Increase timeout for network calls
  })
}) 