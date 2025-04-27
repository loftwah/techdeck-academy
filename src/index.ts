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
  await files.ensureDataDirectories()
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
  const recentChallenges = (context as any).recentChallenges ?? []
  const aiMemory = await readAIMemoryRaw()

  // Generate the challenge
  const challenge = await ai.generateChallenge(
    config,
    aiMemory,
    recentChallenges
  )

  // Save the challenge
  await files.writeChallenge(challenge)
  await summary.addActiveChallengeToSummary(challenge)
  await stats.addChallengeStats(challenge)

  // Format and send email
  const emailContent = await email.formatChallengeEmail(
    challenge,
    config.emailStyle
  )
  await email.sendEmail(config, emailContent)

  console.log(`Challenge "${challenge.title}" generated and sent`)
}

/**
 * Processes a submission directory, generates feedback, updates state, and sends email.
 * @param submissionDirPath The path to the submission directory (e.g., 'submissions/CC-123').
 */
async function processSubmission(submissionDirPath: string): Promise<void> {
  console.log(`Processing submission directory: ${submissionDirPath}`);

  // Extract challenge ID from directory path/name
  const challengeId = path.basename(submissionDirPath);
  if (!challengeId || !challengeId.startsWith('CC-')) { // Basic validation
    console.error(`CRITICAL: Could not determine valid Challenge ID from directory path: ${submissionDirPath}`);
    throw new Error(`Invalid submission directory name format: ${submissionDirPath}`);
  }

  // 1. Read the corresponding Challenge file
  const challenge = await files.readChallenge(challengeId);
  if (!challenge) {
    console.error(`CRITICAL: Challenge ${challengeId} not found or failed to load. Cannot process submission for ${submissionDirPath}.`);
    // TODO: Consider moving directory to a 'failed' state?
    throw new Error(`Challenge ${challengeId} not found or invalid.`);
  }
  console.log(`Found challenge: ${challenge.title}`);

  // 2. Read the content of the submission directory
  const submissionContent = await files.readSubmissionDirectoryContent(submissionDirPath);
  if (submissionContent === null) {
    console.error(`CRITICAL: Failed to read content from submission directory: ${submissionDirPath}`);
    // TODO: Consider moving directory to a 'failed' state?
    throw new Error(`Failed to read content from submission directory: ${submissionDirPath}`);
  }
  console.log(`Read content from ${submissionDirPath}. Length: ${submissionContent.length}`);

  // 3. Get AI context/memory
  const aiMemory = await readAIMemoryRaw();

  // 4. Generate feedback using AI
  // Note: We need to adapt ai.generateFeedback to accept content string + challenge ID
  // instead of the old Submission object.
  console.log(`Generating feedback for ${challengeId}...`);
  const feedback = await ai.generateFeedback(
    challenge, // Pass the loaded challenge object
    submissionContent, // Pass the combined content string
    challengeId, // Pass the extracted challenge ID
    aiMemory,
    config.mentorProfile
  );
  console.log(`Feedback generated for submission ${challengeId}`);

  // 5. Save the feedback
  // We still need a unique ID for the feedback file. Using the challenge ID might
  // cause overwrites if retried. Let's use challengeId + timestamp for feedback filename.
  const feedbackId = `${challengeId}-${Date.now()}`; 
  // Modify the feedback object to use this new ID before saving
  const feedbackToSave = { ...feedback, submissionId: feedbackId }; 
  await files.writeFeedback(feedbackToSave);
  console.log(`Feedback saved as ${feedbackId}.json`);

  // 6. Update Stats
  // Adapt addSubmissionStats to accept needed info directly
  const submittedAt = new Date().toISOString(); // Use current time as submission time
  await stats.addSubmissionStats(challengeId, submittedAt, feedbackToSave); 
  console.log(`Stats updated for ${challengeId}`);

  // 7. Update Profile
  // updateProfileWithFeedback might need adjustment if it relied on the old Submission object
  // For now, assume it primarily needs the challenge and feedback objects.
  await profile.updateProfileWithFeedback(config, challenge, feedbackToSave);
  console.log(`Profile updated after feedback for ${challengeId}`);

  // 8. Format and send email
  // Adapt formatFeedbackEmail call
  const emailContent = await email.formatFeedbackEmail(
    feedbackToSave, // Pass the feedback object with the unique ID
    challenge, // Pass the challenge object
    config.emailStyle
  );
  await email.sendEmail(config, emailContent);
  console.log(`Feedback email sent for ${challengeId}`);

  // 9. Old step: Save submission (files.writeSubmission) - Not needed, files are already there.

  console.log(`Successfully processed submission for challenge ${challengeId} in directory ${submissionDirPath}`);
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
      await summary.archiveChallengeInSummary(challengeId);
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