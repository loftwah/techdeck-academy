import { promises as fs } from 'fs'
import type { StudentProfile, Challenge, Feedback, MentorProfile, LetterInsights, Config } from '../types.js'
import { linusProfile } from '../profiles/linus.js'
import { updateAIMemory } from './ai-memory-manager.js'

const PROFILE_FILE = 'student-profile.json'

// Default profile structure
const DEFAULT_PROFILE: StudentProfile = {
  userId: 'default-user',
  currentSkillLevel: 1,
  completedChallenges: 0,
  averageScore: 0,
  lastUpdated: new Date().toISOString(),
  status: 'awaiting_introduction', // Default status
  topicLevels: {}
}

export async function readStudentProfile(config: Config): Promise<StudentProfile> {
  try {
    const content = await fs.readFile(PROFILE_FILE, 'utf-8')
    let profile = JSON.parse(content) as StudentProfile
    // Ensure status exists for older profiles
    if (!profile.status) {
      profile.status = 'awaiting_introduction' 
    }
    // Optionally merge/update topicLevels if config changed?
    // For now, just return the existing profile
    return profile
  } catch (error) {
    // Create default profile WITH topic levels from config
    console.log('Student profile not found, creating default profile with configured topics.')
    const defaultProfile: StudentProfile = {
      userId: config.githubUsername || 'default-user', // Use username from config
      currentSkillLevel: 1, // Initial overall level
      completedChallenges: 0,
      averageScore: 0,
      lastUpdated: new Date().toISOString(),
      status: 'awaiting_introduction', // Default status
      topicLevels: Object.fromEntries(
        Object.entries(config.topics).map(([topic, { currentLevel }]) => [topic, currentLevel])
      ) // Populate from config
    }
    // Ensure the default profile is written back if created
    await writeStudentProfile(defaultProfile);
    return defaultProfile
  }
}

export async function writeStudentProfile(profile: StudentProfile): Promise<void> {
  await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2))
}

// New function to update the profile status to active
export async function setProfileStatusActive(config: Config): Promise<void> {
  try {
    const profile = await readStudentProfile(config);
    if (profile.status !== 'active') {
      profile.status = 'active';
      profile.lastUpdated = new Date().toISOString();
      await writeStudentProfile(profile);
      console.log('Student profile status updated to active.');
      // Log this significant event to AI memory as well
      await logAIMemoryEvent(config, 'Student status set to ACTIVE (first interaction processed).');
    } else {
      console.log('Profile status is already active.');
    }
  } catch (error) {
    console.error('Failed to update profile status to active:', error);
  }
}

export async function updateProfileWithFeedback(
  config: Config,
  challenge: Challenge,
  feedback: Feedback
): Promise<void> {
  const profile = await readStudentProfile(config)
  const now = new Date().toISOString()

  // --- Update Core Metrics in JSON Profile ---
  profile.completedChallenges++

  const currentAverage = profile.averageScore ?? 0
  const currentTotalScore = currentAverage * (profile.completedChallenges - 1)
  const newTotalScore = currentTotalScore + feedback.score
  profile.averageScore = parseFloat((newTotalScore / profile.completedChallenges).toFixed(2))

  profile.lastUpdated = now
  await writeStudentProfile(profile) // Write minimal profile

  // --- Log Detailed Context to AI Memory ---
  const memoryEntry = `
*   **Challenge Completed:** ${challenge.title} (ID: ${challenge.id})
*   **Score:** ${feedback.score}/100
*   **AI Feedback Suggestions:** ${feedback.suggestions.join(', ') || 'None provided'}
*   **Identified Strengths:** ${feedback.strengths.join(', ') || 'None noted'}
*   **Identified Weaknesses:** ${feedback.weaknesses.join(', ') || 'None noted'}
*   **Timestamp:** ${now}
  `

  try {
    await updateAIMemory('recentActivity', memoryEntry.trim())
    console.log(`Logged feedback context for challenge ${challenge.id} to AI memory.`)
  } catch (error) {
    console.error(`Failed to log feedback context for challenge ${challenge.id} to AI memory:`, error)
  }
}

export async function logAIMemoryEvent(
  config: Config,
  eventDescription: string, 
  section: 'recentActivity' | 'snapshot' | 'history' = 'recentActivity'
): Promise<void> {
  const now = new Date().toISOString()
  const memoryEntry = `*   [${now}] ${eventDescription}`

  try {
    await updateAIMemory(section, memoryEntry)
    console.log(`Logged event to AI memory (${section}): "${eventDescription}"`)
  } catch (error) {
    console.error(`Failed to log event to AI memory (${section}):`, error)
  }
  // Also update the timestamp in the minimal profile
  try {
    const profile = await readStudentProfile(config)
    profile.lastUpdated = now
    await writeStudentProfile(profile)
  } catch (error) {
    console.error('Failed to update profile timestamp after logging AI memory event:', error)
  }
}

export async function loadMentorProfile(profileName: string): Promise<MentorProfile> {
  if (profileName !== 'linus') {
    console.warn(`Mentor profile '${profileName}' not found. Defaulting to Linus Torvalds.`)
  }
  return linusProfile
}

export async function updateProfileFromLetterInsights(
  config: Config,
  insights: LetterInsights
): Promise<void> {
  if (!insights || Object.keys(insights).length === 0) {
    console.log('No insights provided from letter, AI memory not updated.')
    return // Nothing to update
  }

  const now = new Date().toISOString()
  console.log('Processing letter insights for AI Memory:', insights)

  // --- Log Detailed Context to AI Memory ---
  let memoryEntry = `*   **Insights from Letter (${now}):**`
  if (insights.sentiment) memoryEntry += ` Sentiment: ${insights.sentiment}.`
  if (insights.strengths && insights.strengths.length > 0) memoryEntry += ` Strengths Mentioned: ${insights.strengths.join(', ')}.`
  if (insights.weaknesses && insights.weaknesses.length > 0) memoryEntry += ` Weaknesses Mentioned: ${insights.weaknesses.join(', ')}.`
  if (insights.topics && insights.topics.length > 0) memoryEntry += ` Topics Discussed: ${insights.topics.join(', ')}.`
  if (insights.skillLevelAdjustment) memoryEntry += ` Suggested Skill Adjustment: ${insights.skillLevelAdjustment}.` // Log suggestion, don't apply directly
  if (insights.flags && insights.flags.length > 0) memoryEntry += ` Flags: ${insights.flags.join(', ')}.`

  try {
    await updateAIMemory('recentActivity', memoryEntry)
    console.log('Logged letter insights context to AI memory.')
  } catch (error) {
    console.error('Failed to log letter insights context to AI memory:', error)
  }

  // --- Update Minimal JSON Profile Timestamp ---
  try {
    const profile = await readStudentProfile(config)
    profile.lastUpdated = now
    // Optionally update core metrics like skill level IF the insight implies a direct, simple update AND we keep that field
    // Example: if (insights.skillLevelAdjustment) profile.currentSkillLevel = Math.max(1, Math.min(10, profile.currentSkillLevel + insights.skillLevelAdjustment))
    await writeStudentProfile(profile)
    console.log('Minimal student profile timestamp updated.')
  } catch (error) {
    console.error('Failed to update profile timestamp after processing letter insights:', error)
  }
}

// Helper function to load mentor profiles dynamically (if needed in the future)
// async function loadMentorProfileFromFile(profileName: string): Promise<MentorProfile> {
//   const profilePath = path.join(__dirname, '../profiles', `${profileName}.json`); // Assuming JSON format
//   try {
//     const content = await fs.readFile(profilePath, 'utf-8')
//     return JSON.parse(content) as MentorProfile
//   } catch (error) {
//     console.error(`Error loading mentor profile '${profileName}':`, error)
//     // Fallback to a default or throw an error
//     throw new Error(`Mentor profile ${profileName} not found or invalid.`)
//   }
// } 