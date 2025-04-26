import { promises as fs } from 'fs'
import type { StudentProfile, Challenge, Feedback, MentorProfile, LetterInsights } from '../types.js'
import { linusProfile } from '../profiles/linus.js'

const PROFILE_FILE = 'student-profile.json'

// Default profile structure
const DEFAULT_PROFILE: StudentProfile = {
  userId: 'default-user',
  strengths: [],
  weaknesses: [],
  currentSkillLevel: 1,
  topicProgress: {},
  recommendedTopics: [],
  preferredTopics: [],
  completedChallenges: 0,
  averageScore: 0,
  notes: 'New student profile initialized.',
  lastUpdated: new Date().toISOString()
}

export async function readStudentProfile(): Promise<StudentProfile> {
  try {
    const content = await fs.readFile(PROFILE_FILE, 'utf-8')
    return JSON.parse(content) as StudentProfile
  } catch (error) {
    // Return default profile if file doesn't exist
    return DEFAULT_PROFILE
  }
}

export async function writeStudentProfile(profile: StudentProfile): Promise<void> {
  await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2))
}

export async function updateProfileWithFeedback(
  challenge: Challenge,
  feedback: Feedback
): Promise<void> {
  const profile = await readStudentProfile()
  const now = new Date().toISOString()

  // Update completed challenges count
  profile.completedChallenges++

  // Update average score
  const currentAverage = profile.averageScore ?? 0; // Default to 0 if undefined
  const currentTotalScore = currentAverage * (profile.completedChallenges - 1);
  const newTotalScore = currentTotalScore + feedback.score;
  profile.averageScore = newTotalScore / profile.completedChallenges;

  // Update topic progress
  for (const topic of challenge.topics) {
    if (!profile.topicProgress[topic]) {
      profile.topicProgress[topic] = 0
    }
    // Increment progress based on score (0.1 for completion, up to 0.9 based on score)
    const scoreProgress = feedback.score / 100 * 0.9
    profile.topicProgress[topic] = Math.min(
      1,
      profile.topicProgress[topic] + 0.1 + scoreProgress
    )
  }

  // Update strengths and weaknesses based on feedback
  updateStrengthsAndWeaknesses(profile, feedback)

  // Update recommended topics
  updateRecommendedTopics(profile)

  // Update skill level
  updateSkillLevel(profile)

  profile.lastUpdated = now
  await writeStudentProfile(profile)
}

function updateStrengthsAndWeaknesses(
  profile: StudentProfile,
  feedback: Feedback
): void {
  // Keep only the most recent 5 strengths and weaknesses
  const maxItems = 5

  // Add new strengths while avoiding duplicates
  for (const strength of feedback.strengths) {
    if (!profile.strengths.includes(strength)) {
      profile.strengths.unshift(strength)
      if (profile.strengths.length > maxItems) {
        profile.strengths.pop()
      }
    }
  }

  // Add new weaknesses while avoiding duplicates
  for (const weakness of feedback.weaknesses) {
    if (!profile.weaknesses.includes(weakness)) {
      profile.weaknesses.unshift(weakness)
      if (profile.weaknesses.length > maxItems) {
        profile.weaknesses.pop()
      }
    }
  }
}

function updateRecommendedTopics(profile: StudentProfile): void {
  // Find topics with low progress
  const lowProgressTopics = Object.entries(profile.topicProgress)
    .filter(([_, progress]) => progress < 0.5)
    .map(([topic]) => topic)

  // Prioritize topics that are weaknesses
  const weaknessTopics = profile.weaknesses
    .flatMap(weakness => {
      // Extract topics from weakness descriptions
      // This is a simple example - you might want more sophisticated matching
      return Object.keys(profile.topicProgress)
        .filter(topic => weakness.toLowerCase().includes(topic.toLowerCase()))
    })

  // Combine and deduplicate topics
  profile.recommendedTopics = [...new Set([...weaknessTopics, ...lowProgressTopics])]
    .slice(0, 5) // Keep top 5 recommendations
}

function updateSkillLevel(profile: StudentProfile): void {
  // Ensure averageScore is treated as 0 if undefined
  const avgScore = profile.averageScore ?? 0;

  // Calculate skill level based on multiple factors
  const factors = {
    averageScore: (avgScore / 100) * 0.4, // 40% weight
    topicProgress: Object.values(profile.topicProgress).reduce((sum, p) => sum + p, 0) /
      Math.max(1, Object.keys(profile.topicProgress).length) * 0.3, // 30% weight
    completedChallenges: Math.min(1, profile.completedChallenges / 50) * 0.3 // 30% weight
  };

  const totalProgress = Object.values(factors).reduce((sum, factor) => sum + factor, 0)
  profile.currentSkillLevel = Math.round(totalProgress * 10) // Convert to 1-10 scale
}

export async function addNotes(notes: string): Promise<void> {
  const profile = await readStudentProfile()
  profile.notes = `${new Date().toISOString()}: ${notes}\n${profile.notes}`
  profile.lastUpdated = new Date().toISOString()
  await writeStudentProfile(profile)
}

export async function loadMentorProfile(profileName: string): Promise<MentorProfile> {
  if (profileName !== 'linus') {
    console.warn(`Mentor profile '${profileName}' not found. Defaulting to Linus Torvalds.`)
  }
  return linusProfile
}

export async function updateProfileFromLetterInsights(
  insights: LetterInsights
): Promise<void> {
  if (!insights || Object.keys(insights).length === 0) {
    console.log('No insights provided from letter, profile not updated.');
    return; // Nothing to update
  }

  const profile = await readStudentProfile();
  const maxItems = 5; // Limit history size for strengths/weaknesses

  console.log('Updating profile with insights:', insights);

  // Update strengths
  if (insights.strengths && insights.strengths.length > 0) {
    insights.strengths.forEach(strength => {
      if (!profile.strengths.includes(strength)) {
        profile.strengths.unshift(strength); // Add to beginning
      }
    });
    profile.strengths = profile.strengths.slice(0, maxItems); // Keep most recent
  }

  // Update weaknesses
  if (insights.weaknesses && insights.weaknesses.length > 0) {
    insights.weaknesses.forEach(weakness => {
      if (!profile.weaknesses.includes(weakness)) {
        profile.weaknesses.unshift(weakness); // Add to beginning
      }
    });
    profile.weaknesses = profile.weaknesses.slice(0, maxItems); // Keep most recent
  }

  // Update recent topics (optional, if insights provide topics)
  if (insights.topics && insights.topics.length > 0) {
    const recentTopicsSet = new Set(profile.recentTopics || []);
    insights.topics.forEach(topic => recentTopicsSet.add(topic));
    profile.recentTopics = Array.from(recentTopicsSet).slice(-10); // Keep last 10 topics
  }

  // Adjust skill level (optional)
  if (insights.skillLevelAdjustment) {
    profile.currentSkillLevel = Math.max(1, Math.min(10, profile.currentSkillLevel + insights.skillLevelAdjustment));
    profile.currentSkillLevel = parseFloat(profile.currentSkillLevel.toFixed(1)); // Keep one decimal place
    console.log(`Adjusted skill level by ${insights.skillLevelAdjustment} to ${profile.currentSkillLevel}`);
  }

  // Add insights/flags to notes (optional)
  let noteUpdate = 'Insights from letter:';
  let hasNotes = false;
  if (insights.sentiment) { noteUpdate += ` Sentiment: ${insights.sentiment}.`; hasNotes = true; }
  if (insights.flags && insights.flags.length > 0) { noteUpdate += ` Flags: ${insights.flags.join(', ')}.`; hasNotes = true; }
  if (hasNotes) {
    profile.notes = `${new Date().toISOString()}: ${noteUpdate}\n${profile.notes}`;
  }

  profile.lastUpdated = new Date().toISOString();
  await writeStudentProfile(profile);
  console.log('Profile updated successfully based on letter insights.');
}

// Helper function to load mentor profiles dynamically (if needed in the future)
// async function loadMentorProfileFromFile(profileName: string): Promise<MentorProfile> {
//   const profilePath = path.join(__dirname, '../profiles', `${profileName}.json`); // Assuming JSON format
//   try {
//     const content = await fs.readFile(profilePath, 'utf-8');
//     return JSON.parse(content) as MentorProfile;
//   } catch (error) {
//     console.error(`Error loading mentor profile '${profileName}':`, error);
//     // Fallback to a default or throw an error
//     throw new Error(`Mentor profile ${profileName} not found or invalid.`);
//   }
// } 