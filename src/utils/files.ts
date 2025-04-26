import { promises as fs } from 'fs'
import path from 'path'
import type { Challenge, Submission, Feedback, StudentProfile } from '../types.js'

// Base paths for different file types
const PATHS = {
  challenges: 'challenges',
  submissions: 'submissions',
  feedback: 'feedback',
  letters: {
    toMentor: 'letters/to-mentor',
    fromMentor: 'letters/from-mentor',
    archive: 'letters/archive'
  },
  archive: {
    challenges: 'archive/challenges',
    submissions: 'archive/submissions',
    feedback: 'archive/feedback',
    letters: 'archive/letters'
  },
  progress: {
    weekly: 'progress/weekly',
    monthly: 'progress/monthly',
    quarterly: 'progress/quarterly',
    cleanupReports: 'progress/cleanup-reports'
  }
} as const

// Ensure directories exist
export async function ensureDirectories(): Promise<void> {
  const allPaths = [
    PATHS.challenges,
    PATHS.submissions,
    PATHS.feedback,
    PATHS.letters.toMentor,
    PATHS.letters.fromMentor,
    PATHS.letters.archive,
    PATHS.archive.challenges,
    PATHS.archive.submissions,
    PATHS.archive.feedback,
    PATHS.archive.letters,
    PATHS.progress.weekly,
    PATHS.progress.monthly,
    PATHS.progress.quarterly,
    PATHS.progress.cleanupReports
  ]

  for (const dir of allPaths) {
    await fs.mkdir(dir, { recursive: true })
  }
}

// Challenge operations
export async function writeChallenge(challenge: Challenge): Promise<void> {
  const filename = `${challenge.id}.json`
  const filepath = path.join(PATHS.challenges, filename)
  await fs.writeFile(filepath, JSON.stringify(challenge, null, 2))
}

export async function readChallenge(challengeId: string): Promise<Challenge> {
  const filepath = path.join(PATHS.challenges, `${challengeId}.json`)
  const content = await fs.readFile(filepath, 'utf-8')
  return JSON.parse(content) as Challenge
}

export async function listChallenges(): Promise<string[]> {
  const files = await fs.readdir(PATHS.challenges)
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
}

// Submission operations
export async function writeSubmission(submission: Submission): Promise<void> {
  const filename = `${submission.challengeId}-${Date.now()}.json`
  const filepath = path.join(PATHS.submissions, filename)
  await fs.writeFile(filepath, JSON.stringify(submission, null, 2))
}

export async function readSubmission(submissionId: string): Promise<Submission> {
  const filepath = path.join(PATHS.submissions, `${submissionId}.json`)
  const content = await fs.readFile(filepath, 'utf-8')
  return JSON.parse(content) as Submission
}

export async function listSubmissions(challengeId?: string): Promise<string[]> {
  const files = await fs.readdir(PATHS.submissions)
  const submissions = files.filter(f => f.endsWith('.json'))
  if (challengeId) {
    return submissions.filter(f => f.startsWith(challengeId))
  }
  return submissions.map(f => f.replace('.json', ''))
}

// Feedback operations
export async function writeFeedback(feedback: Feedback): Promise<void> {
  const filename = `${feedback.submissionId}.json`
  const filepath = path.join(PATHS.feedback, filename)
  await fs.writeFile(filepath, JSON.stringify(feedback, null, 2))
}

export async function readFeedback(submissionId: string): Promise<Feedback> {
  const filepath = path.join(PATHS.feedback, `${submissionId}.json`)
  const content = await fs.readFile(filepath, 'utf-8')
  return JSON.parse(content) as Feedback
}

// Student profile operations
export async function readStudentProfile(): Promise<StudentProfile> {
  try {
    const content = await fs.readFile('student-profile.json', 'utf-8')
    return JSON.parse(content) as StudentProfile
  } catch (error) {
    // Return default profile if file doesn't exist
    return {
      strengths: [],
      weaknesses: [],
      currentSkillLevel: 1,
      recommendedTopics: [],
      completedChallenges: 0,
      averageScore: 0,
      topicProgress: {},
      notes: 'New student profile',
      lastUpdated: new Date().toISOString()
    }
  }
}

export async function writeStudentProfile(profile: StudentProfile): Promise<void> {
  await fs.writeFile(
    'student-profile.json', 
    JSON.stringify(profile, null, 2)
  )
}

// Archive operations
export async function archiveChallenge(challengeId: string): Promise<void> {
  const challenge = await readChallenge(challengeId)
  const monthDir = getMonthDir()
  const archivePath = path.join(PATHS.archive.challenges, monthDir)
  
  await fs.mkdir(archivePath, { recursive: true })
  await fs.rename(
    path.join(PATHS.challenges, `${challengeId}.json`),
    path.join(archivePath, `${challengeId}.json`)
  )
}

export async function archiveSubmission(submissionId: string): Promise<void> {
  const monthDir = getMonthDir()
  const archivePath = path.join(PATHS.archive.submissions, monthDir)
  
  await fs.mkdir(archivePath, { recursive: true })
  await fs.rename(
    path.join(PATHS.submissions, `${submissionId}.json`),
    path.join(archivePath, `${submissionId}.json`)
  )
}

// Helper functions
function getMonthDir(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export async function isFileOlderThan(filepath: string, days: number): Promise<boolean> {
  try {
    const stats = await fs.stat(filepath)
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
    return ageInDays > days
  } catch {
    return false
  }
}

// Export paths for use in other modules
export { PATHS } 