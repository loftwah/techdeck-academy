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
  name: 'Default User',
  currentSkillLevel: 1,
  completedChallenges: 0,
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

// NEW FUNCTION: Encapsulates profile loading, creation, and syncing
export async function loadOrCreateAndSyncProfile(config: Config): Promise<StudentProfile> {
    let studentProfile = await readStudentProfile(config);
    let profileWasCreatedOrModified = false;

    if (!studentProfile) {
        console.warn('Student profile not found or invalid. Creating default profile based on config.');
        const now = new Date().toISOString();
        const initialStatus = config.introductionSubmitted ? 'active' : 'awaiting_introduction';

        studentProfile = {
            userId: config.githubUsername || 'default-user',
            name: config.githubUsername || 'Default User',
            completedChallenges: 0,
            currentSkillLevel: config.difficulty,
            lastUpdated: now,
            status: initialStatus,
            topicLevels: {},
            currentChallengeId: undefined,
        };

        for (const topic in config.topics) {
            if (!studentProfile.topicLevels) { // Should always be true here, but safe check
                studentProfile.topicLevels = {};
            }
            studentProfile.topicLevels[topic] = { currentLevel: config.topics[topic].currentLevel };
        }
        profileWasCreatedOrModified = true;
        console.log('Default student profile constructed.');

    } else {
        console.log('Existing profile found. Checking sync status against config...');
        // Sync logic moved from index.ts
        let needsSync = false;
        if (!studentProfile.topicLevels) {
            studentProfile.topicLevels = {};
        }
        const configTopics = Object.keys(config.topics);
        const profileTopicLevels = studentProfile.topicLevels as Record<string, { currentLevel: number }>; 
        const profileTopics = Object.keys(profileTopicLevels);

        for (const topic of configTopics) {
            if (!profileTopicLevels[topic]) {
                console.log(`Sync: Adding topic '${topic}' to profile from config.`);
                profileTopicLevels[topic] = { currentLevel: config.topics[topic].currentLevel };
                needsSync = true;
            }
            // Optional: Check if level itself changed? For now, just add/remove topics.
        }
        for (const topic of profileTopics) {
            if (!(topic in config.topics)) {
                console.log(`Sync: Removing topic '${topic}' from profile (not in config).`);
                delete profileTopicLevels[topic];
                needsSync = true;
            }
        }

        if (config.githubUsername && studentProfile.userId !== config.githubUsername) {
            console.log(`Sync: Updating profile userId to match config.githubUsername '${config.githubUsername}'.`);
            studentProfile.userId = config.githubUsername;
            needsSync = true;
        }
        const expectedName = config.githubUsername || 'Default User';
        if (studentProfile.name !== expectedName) {
            console.log(`Sync: Updating profile name to '${expectedName}'.`);
            studentProfile.name = expectedName;
            needsSync = true;
        }
        
        // Crucially, do NOT sync status or currentSkillLevel from config here.
        // Those are managed by intro flow and user edits respectively.

        if (needsSync) {
            console.log('Profile requires sync with config.');
            studentProfile.topicLevels = profileTopicLevels; // Ensure the updated object is assigned back
            studentProfile.lastUpdated = new Date().toISOString();
            profileWasCreatedOrModified = true;
        } else {
            console.log('Profile is already in sync with config (userId, name, topics).');
        }
    }

    // Write profile ONLY if it was newly created or modified during sync
    if (profileWasCreatedOrModified) {
        console.log('Writing created/updated profile to disk...');
        await writeStudentProfile(studentProfile); // Handles validation
    }

    return studentProfile; // Return the definitive profile object
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

    profile.lastUpdated = now
    await writeStudentProfile(profile) // Write minimal profile

    // --- Log Detailed Context to AI Memory ---
    const memoryEntry = `
*   **Challenge Completed:** ${challenge.title} (ID: ${challenge.id})
*   **AI Feedback Summary:** (Strengths: ${feedback.strengths.join(', ') || 'None'}, Weaknesses: ${feedback.weaknesses.join(', ') || 'None'}, Suggestions: ${feedback.suggestions.join(', ') || 'None'})
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