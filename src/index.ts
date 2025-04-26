import { config } from './config.js'
import * as ai from './utils/ai.js'
import * as email from './utils/email.js'
import * as files from './utils/files.js'
import * as stats from './utils/stats-manager.js'
import * as summary from './utils/summary-manager.js'
import * as profile from './utils/profile-manager.js'
import { readStudentProfile, writeStudentProfile, loadMentorProfile } from './utils/profile-manager.js'
import { readAIMemoryRaw } from './utils/ai-memory-manager.js'
import type { Challenge, Submission, StudentProfile } from './types.js'
import path from 'path'
import crypto from 'crypto'

// Initialize the application
async function initialize(): Promise<StudentProfile> {
  await files.ensureDirectories()
  let studentProfileOrNull = await readStudentProfile(config)
  let studentProfile: StudentProfile;

  if (!studentProfileOrNull) {
    console.warn('Student profile not found or invalid. Creating default profile.');
    const now = new Date().toISOString();
    // Create default profile matching the StudentProfile type
    studentProfile = {
        userId: config.githubUsername || 'default-user',
        name: config.githubUsername || 'Default User', // Use name
        completedChallenges: 0,
        averageScore: 0, 
        currentSkillLevel: config.difficulty, 
        lastUpdated: now,
        status: 'awaiting_introduction', 
        topicLevels: {}, 
        currentChallengeId: undefined, 
    };
    // Populate topicLevels correctly with { currentLevel: number }
    for (const topic in config.topics) {
        // Explicitly check/initialize topicLevels inside loop for TS
        if (!studentProfile.topicLevels) {
            studentProfile.topicLevels = {};
        }
        studentProfile.topicLevels[topic] = { currentLevel: config.topics[topic].currentLevel }; 
    }
    await writeStudentProfile(studentProfile); 
    console.log('Created and saved a default student profile.');
  } else {
      studentProfile = studentProfileOrNull;
      let profileWasModified = false;
      console.log('Checking profile against current config...');

      // Initialize topicLevels if it's undefined/null
      if (!studentProfile.topicLevels) {
          studentProfile.topicLevels = {};
      }

      const configTopics = Object.keys(config.topics);
      // Ensure topicLevels is treated as the correct type
      const profileTopicLevels = studentProfile.topicLevels as Record<string, { currentLevel: number }>; 
      const profileTopics = Object.keys(profileTopicLevels);
      
      for (const topic of configTopics) {
          if (!profileTopicLevels[topic]) {
              console.log(`Sync: Adding topic '${topic}' to profile from config.`);
              // Assign correct { currentLevel: number } object
              profileTopicLevels[topic] = { currentLevel: config.topics[topic].currentLevel }; 
              profileWasModified = true;
          }
      }
      for (const topic of profileTopics) {
          if (!(topic in config.topics)) {
              console.log(`Sync: Removing topic '${topic}' from profile (not in config).`);
              delete profileTopicLevels[topic];
              profileWasModified = true;
          }
      }
      
      if (config.githubUsername && studentProfile.userId !== config.githubUsername) {
          console.log(`Sync: Updating profile userId to match config.githubUsername '${config.githubUsername}'.`);
          studentProfile.userId = config.githubUsername;
          profileWasModified = true;
      }
      // Sync name field if needed
      const expectedName = config.githubUsername || 'Default User';
       if (studentProfile.name !== expectedName) {
          console.log(`Sync: Updating profile name to '${expectedName}'.`);
          studentProfile.name = expectedName;
          profileWasModified = true;
      }

      if (profileWasModified) {
          studentProfile.lastUpdated = new Date().toISOString(); 
          console.log('Profile was modified during config sync. Writing updates...');
          // Assign the potentially modified topicLevels back before writing
          studentProfile.topicLevels = profileTopicLevels; 
          await writeStudentProfile(studentProfile); 
      }
  }
  
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