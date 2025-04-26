import { config } from './config.js'
import * as ai from './utils/ai.js'
import * as email from './utils/email.js'
import * as files from './utils/files.js'
import * as stats from './utils/stats-manager.js'
import * as summary from './utils/summary-manager.js'
import * as profile from './utils/profile-manager.js'
import type { Challenge, Submission, StudentProfile } from './types.js'

// Initialize the application
async function initialize(): Promise<StudentProfile> {
  // Ensure all required directories exist
  await files.ensureDirectories()

  // Load or create student profile
  const studentProfile = await profile.readStudentProfile()

  // Check if stats need compaction
  if (await stats.shouldCompactStats()) {
    await stats.aggregateOldEntries()
  }

  console.log('TechDeck Academy initialized successfully')
  return studentProfile
}

// Generate and send a new challenge
async function generateChallenge(): Promise<void> {
  const studentProfile = await profile.readStudentProfile()
  const context = await summary.getContextForAI('challenge')
  const recentChallenges = (context as any).recentChallenges || []

  // Generate the challenge
  const challenge = await ai.generateChallenge(
    config,
    studentProfile,
    recentChallenges
  )

  // Save the challenge
  await files.writeChallenge(challenge)
  await summary.addChallengeToSummary(challenge)
  await stats.addChallengeStats(challenge)

  // Format and send email
  const emailContent = await email.formatChallengeEmail(
    challenge,
    config.emailStyle
  )
  await email.sendEmail(config, emailContent)

  console.log(`Challenge "${challenge.title}" generated and sent`)
}

// Process a submission and provide feedback
async function processSubmission(submission: Submission): Promise<void> {
  const studentProfile = await profile.readStudentProfile()
  const challenge = await files.readChallenge(submission.challengeId)

  // Save the submission
  await files.writeSubmission(submission)

  // Generate feedback
  const feedback = await ai.generateFeedback(
    challenge,
    submission,
    studentProfile,
    config.mentorProfile
  )

  // Save the feedback
  await files.writeFeedback(feedback)
  await stats.addSubmissionStats(submission, feedback)
  await profile.updateProfileWithFeedback(challenge, feedback)

  // Format and send email
  const emailContent = await email.formatFeedbackEmail(
    feedback,
    submission,
    challenge,
    config.emailStyle
  )
  await email.sendEmail(config, emailContent)

  console.log(`Feedback generated for submission ${submission.challengeId}`)
}

// Archive old content
async function archiveOldContent(): Promise<void> {
  const { archive } = config

  // Get all challenges
  const challengeIds = await files.listChallenges()

  for (const challengeId of challengeIds) {
    const challengePath = `${files.PATHS.challenges}/${challengeId}.json`
    if (await files.isFileOlderThan(challengePath, archive.challengeRetentionDays)) {
      await files.archiveChallenge(challengeId)
      await summary.moveChallengeToArchived(challengeId)
    }
  }

  // Archive old submissions
  const submissionIds = await files.listSubmissions()
  for (const submissionId of submissionIds) {
    const submissionPath = `${files.PATHS.submissions}/${submissionId}.json`
    if (await files.isFileOlderThan(submissionPath, archive.submissionRetentionDays)) {
      await files.archiveSubmission(submissionId)
    }
  }

  // Prune old summary entries
  await summary.pruneOldSummaryEntries(archive.challengeRetentionDays)

  console.log('Archive operation completed')
}

// Export the main functions and config
export {
  initialize,
  generateChallenge,
  processSubmission,
  archiveOldContent,
  config
} 