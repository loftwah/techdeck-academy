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
  MentorProfile,
  Schedule
} from '../../types.js'

describe('Email Utilities', () => {
  describe('formatChallengeEmail', () => {
    it('should format challenge email correctly', async () => {
      const testChallenge: Challenge = {
        id: 'challenge-1',
        title: 'Test Challenge',
        description: 'A test challenge description',
        type: 'coding',
        requirements: ['Requirement 1', 'Requirement 2'],
        examples: ['Example 1', 'Example 2'],
        hints: ['Hint 1'],
        difficulty: 3,
        topics: ['typescript', 'testing'],
        createdAt: new Date().toISOString()
      };
      const result = await formatChallengeEmail(testChallenge, 'technical')
      
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
      const testChallenge: Challenge = {
        id: 'challenge-1', title: 'Test Challenge', description: '', type: 'coding',
        requirements: [], examples: [], difficulty: 3, topics: [], createdAt: new Date().toISOString()
      };
      const testFeedback: Feedback = {
        submissionId: 'submission-1',
        strengths: ['Good code organization'],
        weaknesses: ['Could improve error handling'],
        suggestions: ['Consider adding try-catch blocks'],
        improvementPath: 'Focus on error handling patterns',
        createdAt: new Date().toISOString()
      };
      const result = await formatFeedbackEmail(
        testFeedback,
        { challengeId: testChallenge.id },
        testChallenge,
        'technical'
      )
      
      expect(result.subject).toBe('Feedback: Test Challenge')
      expect(result.html).toContain('Good code organization')
      expect(result.html).toContain('Could improve error handling')
      expect(result.html).toContain('Consider adding try-catch blocks')
    })
  })

  describe('formatDigestEmail', () => {
    it.skip('should format digest email correctly', async () => {
      const testDigest: any = {
        type: 'weekly',
        period: { start: '2024-03-01', end: '2024-03-07' },
        stats: {
          challengesCompleted: 5,
          topicsProgress: { typescript: 0.75, testing: 0.6 },
          strengths: ['TypeScript fundamentals', 'Code organization'],
          areasForImprovement: ['Error handling', 'Testing coverage']
        },
        recommendations: ['Practice more error handling scenarios'],
        nextSteps: ['Complete the error handling challenge']
      };
      const result = await formatDigestEmail(testDigest, 'technical')
      
      expect(result.subject).toBe('Weekly Progress Digest')
    })
  })

  describe('sendEmail Retry Logic', () => {
    it('should eventually send an email successfully after retries', async () => {
      const testConfig: Partial<Config> = { userEmail: 'test@example.com' };
      const content = {
        subject: 'Test - sendEmail internal retry',
        html: '<p>This email was sent by a test (testing internal retry).</p>'
      };
      await expect(emailUtils.sendEmail(testConfig as Config, content))
        .resolves.toBeUndefined();
    }, 30000);
  })

  describe('sendEmail', () => {
    it('should validate email content before sending', async () => {
      const testConfig: Partial<Config> = { userEmail: 'test@example.com' };
      await expect(emailUtils.sendEmail(testConfig as Config, {
        subject: '',
        html: '<p>Test</p>'
      })).rejects.toThrow('Email subject is required')

      await expect(emailUtils.sendEmail(testConfig as Config, {
        subject: 'Test',
        html: ''
      })).rejects.toThrow('Email HTML content is required')

      await expect(emailUtils.sendEmail(testConfig as Config, {
        subject: 'A'.repeat(101),
        html: '<p>Test</p>'
      })).rejects.toThrow('Email subject is too long')
    })

    it('should send an email via Resend', async () => {
      const testConfig: Partial<Config> = { userEmail: 'test@example.com' };
      const content = {
        subject: 'Test - sendEmail',
        html: '<p>This email was sent by a test.</p>'
      }
      await expect(emailUtils.sendEmail(testConfig as Config, content))
        .resolves.toBeUndefined();
    }, 30000)
  })
}) 