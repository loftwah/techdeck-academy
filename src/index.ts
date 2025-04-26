import { config } from './config.js'
import * as ai from './utils/ai.js'
import * as email from './utils/email.js'
import * as files from './utils/files.js'
import * as stats from './utils/stats-manager.js'
import * as summary from './utils/summary-manager.js'
import * as profile from './utils/profile-manager.js'
import { loadOrCreateAndSyncProfile, loadMentorProfile } from './utils/profile-manager.js'
import { readAIMemoryRaw } from './utils/ai-memory-manager.js'
import type { Challenge, Submission, StudentProfile } from './types.js'
import path from 'path'
import crypto from 'crypto'

// Initialize the application
async function initialize(): Promise<StudentProfile> {
  await files.ensureDirectories()
  // Load or create the profile, ensuring it's synced with the config
  const studentProfile = await profile.loadOrCreateAndSyncProfile(config);
  
  const isFirstRun = studentProfile.status === 'awaiting_introduction';

  if (isFirstRun) {
    console.log('First-time user (status awaiting_introduction). Sending welcome email...');
    // Load mentor profile
    const mentorProfile = await loadMentorProfile(config.mentorProfile);
    const emailContent = await email.formatWelcomeEmail(config, mentorProfile);
    await email.sendEmail(config, emailContent);
    
    // Potentially update student profile's lastUpdated here if needed
    // For now, just sending email and proceeding.
  }

  // Check if stats need compaction
  if (await stats.shouldCompactStats()) {
    await stats.aggregateOldEntries()
  }

  console.log('TechDeck Academy initialized successfully')
  return studentProfile
}

// Generate and send a new challenge
async function generateChallenge(): Promise<void> {
  // Check if there are existing challenges
  const existingChallenges = await files.listChallenges();
  if (existingChallenges.length > 0) {
    console.log(`Skipping challenge generation: ${existingChallenges.length} existing challenge(s) found in challenges/.`);
    return; // Exit if challenges already exist
  }

  // Proceed with generation if no challenges exist
  console.log('No existing challenges found. Proceeding with generation...');
  const context = await summary.getContextForAI('challenge')
  const recentChallenges = (context as any).recentChallenges || []
  const aiMemory = await readAIMemoryRaw()

  // Generate the challenge
  const challenge = await ai.generateChallenge(
    config,
    aiMemory,
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
  const challenge = await files.readChallenge(submission.challengeId)

  // Check if the challenge was loaded successfully
  if (!challenge) {
      console.error(`CRITICAL: Challenge ${submission.challengeId} not found or failed to load. Cannot process submission.`);
      // TODO: Implement error notification or move submission to a failed state?
      throw new Error(`Challenge ${submission.challengeId} not found or invalid.`);
  }

  // Now it's safe to use challenge
  const aiMemory = await readAIMemoryRaw()

  // Save the submission
  await files.writeSubmission(submission)

  // Generate feedback
  const feedback = await ai.generateFeedback(
    challenge, // challenge is guaranteed to be non-null here
    submission,
    aiMemory,
    config.mentorProfile
  )

  // Save the feedback
  await files.writeFeedback(feedback)
  await stats.addSubmissionStats(submission, feedback)
  await profile.updateProfileWithFeedback(config, challenge, feedback) // challenge is non-null

  // Format and send email
  const emailContent = await email.formatFeedbackEmail(
    feedback,
    submission,
    challenge, // challenge is non-null
    config.emailStyle
  )
  await email.sendEmail(config, emailContent)

  console.log(`Feedback generated for submission ${submission.challengeId}`)
}

// Archive old content
async function archiveOldContent(): Promise<void> {
  const { archive } = config;

  if (!archive.enabled) {
      console.log('Archiving is disabled in config.');
      return;
  }

  const maxAge = archive.maxAgeDays; // Use the single maxAgeDays value
  console.log(`Archiving content older than ${maxAge} days...`);

  // Get all challenges
  const challengeIds = await files.listChallenges();

  for (const challengeId of challengeIds) {
    const challengePath = path.join(files.PATHS.challenges, `${challengeId}.json`); // Use path.join
    if (await files.isFileOlderThan(challengePath, maxAge)) { // Use maxAge
      console.log(`Archiving challenge: ${challengeId}`);
      await files.archiveChallenge(challengeId);
      await summary.moveChallengeToArchived(challengeId);
    }
  }

  // Archive old submissions
  const submissionIds = await files.listSubmissions();
  for (const submissionId of submissionIds) {
    const submissionPath = path.join(files.PATHS.submissions, `${submissionId}.json`); // Use path.join
    if (await files.isFileOlderThan(submissionPath, maxAge)) { // Use maxAge
      console.log(`Archiving submission: ${submissionId}`);
      await files.archiveSubmission(submissionId);
    }
  }

  // Prune old summary entries
  await summary.pruneOldSummaryEntries(maxAge); // Use maxAge

  console.log('Archive operation completed');
}

// Export the main functions and config
export {
  initialize,
  generateChallenge,
  processSubmission,
  archiveOldContent,
  config,
  files,
  profile
} 