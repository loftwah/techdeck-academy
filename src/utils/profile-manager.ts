import { promises as fs } from 'fs'
import path from 'path'
import type { StudentProfile, Challenge, Feedback, MentorProfile, LetterInsights, Config } from '../types.js'
import { linusProfile } from '../profiles/linus.js'
import { updateAIMemory } from './ai-memory-manager.js'
import { StudentProfileSchema } from '../schemas.js'
import { ZodError } from 'zod'

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

// Read student profile
// Updated return type and added validation
export async function readStudentProfile(config: Config): Promise<StudentProfile | null> {
  try {
    const content = await fs.readFile(PROFILE_FILE, 'utf-8')
    const jsonData = JSON.parse(content);
    // Validate using Zod
    const result = StudentProfileSchema.safeParse(jsonData);
     if (result.success) {
        // Optional: Could merge with default config here if needed
        return result.data;
    } else {
        console.error(`Invalid student profile file content:`, result.error.errors);
        return null; // Indicate failure to load/validate
    }
  } catch (error) {
      if (error instanceof SyntaxError) {
          console.error(`Invalid JSON syntax in profile file ${PROFILE_FILE}:`, error);
      } else if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.warn(`Profile file not found: ${PROFILE_FILE}. Consider creating a default.`);
          // TODO: Optionally create and return a default profile?
      } else {
        console.error(`Error reading profile file ${PROFILE_FILE}:`, error);
      }
      return null; // Return null on any read/parse/validation error
  }
}

// Write student profile
// Added validation before writing
export async function writeStudentProfile(profileData: StudentProfile): Promise<void> {
  try {
      // Validate the profile data against the schema before writing
      StudentProfileSchema.parse(profileData); 
      await fs.writeFile(PROFILE_FILE, JSON.stringify(profileData, null, 2));
      console.log('Student profile updated successfully.');
  } catch (error) {
      if (error instanceof ZodError) {
          console.error('Invalid profile data provided for writing:', error.errors);
          // Decide if we should throw or just log
          throw new Error('Attempted to write invalid profile data.'); 
      } else {
          console.error('Error writing student profile:', error);
           throw error; // Re-throw other file system errors
      }
  }
}

// New function to update the profile status to active
export async function setProfileStatusActive(config: Config): Promise<void> {
  try {
    const profile = await readStudentProfile(config);
    if (profile && profile.status !== 'active') {
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
  if (profile) {
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
  } else {
    console.error('Profile not found, unable to update feedback.')
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
    if (profile) {
      profile.lastUpdated = now
      await writeStudentProfile(profile)
    } else {
      console.error('Profile not found, unable to update timestamp.')
    }
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
    if (profile) {
      profile.lastUpdated = now
      // Optionally update core metrics like skill level IF the insight implies a direct, simple update AND we keep that field
      // Example: if (insights.skillLevelAdjustment) profile.currentSkillLevel = Math.max(1, Math.min(10, profile.currentSkillLevel + insights.skillLevelAdjustment))
      await writeStudentProfile(profile)
      console.log('Minimal student profile timestamp updated.')
    } else {
      console.error('Profile not found, unable to update timestamp.')
    }
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