import path from 'path'
import { promises as fs } from 'fs'
import type { Challenge, Submission, Feedback } from '../types.js'
import { ChallengeSchema, SubmissionSchema, FeedbackSchema } from '../schemas.js'
import { readJsonFileWithSchema, writeJsonFileWithSchema } from './file-operations.js'

// Define the base data directory
const DATA_DIR = path.resolve(process.cwd(), 'data');

// Base paths RELATIVE to the DATA_DIR
const RELATIVE_PATHS = {
  challenges: 'challenges',
  submissions: 'submissions',
  feedback: 'feedback',
  profiles: 'profiles', // Base directory for profiles
  letters: {
    toMentor: 'letters/to-mentor',
    fromMentor: 'letters/from-mentor'
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

// Helper function to get full path within data directory
export function getDataPath(...subpaths: string[]): string {
  return path.join(DATA_DIR, ...subpaths);
}

// Export the constants if they need to be used directly elsewhere (adjust as needed)
export const PATHS = RELATIVE_PATHS; 
export { DATA_DIR };

// Ensure directories exist
export async function ensureDataDirectories(): Promise<void> {
  // Flatten the nested paths
  const getAllPaths = (obj: object): string[] => {
    let paths: string[] = [];
    Object.values(obj).forEach(value => {
      if (typeof value === 'string') {
        paths.push(value);
      } else if (typeof value === 'object') {
        paths = paths.concat(getAllPaths(value));
      }
    });
    return paths;
  };
  const relativePaths = getAllPaths(RELATIVE_PATHS);

  for (const dirPath of relativePaths) {
    try {
      // Use the helper to get the full path
      await fs.mkdir(getDataPath(dirPath), { recursive: true }); 
    } catch (error) {
      console.error(`Failed to ensure directory ${getDataPath(dirPath)}:`, error);
    }
  }
}

// Challenge operations
export function getChallengeFilePath(challengeId: string): string {
  // Use helper function
  return path.join(PATHS.challenges, `${challengeId}.json`)
}

export async function writeChallenge(challenge: Challenge): Promise<void> {
  const filepath = getChallengeFilePath(challenge.id)
  await writeJsonFileWithSchema(filepath, challenge, ChallengeSchema)
}

export async function readChallenge(challengeId: string): Promise<Challenge | null> {
  const filepath = getChallengeFilePath(challengeId)
  return await readJsonFileWithSchema<Challenge>(filepath, ChallengeSchema)
}

export async function listChallenges(): Promise<string[]> {
  const files = await fs.readdir(PATHS.challenges)
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
}

// Submission operations
export async function writeSubmission(submission: Submission): Promise<string> {
  const submissionId = `${submission.challengeId}-${Date.now()}`;
  const filename = `${submissionId}.json`;
  const relativePath = path.join(PATHS.submissions, filename);
  await writeJsonFileWithSchema<Submission>(relativePath, submission, SubmissionSchema);
  return submissionId;
}

export async function readSubmission(submissionId: string): Promise<Submission | null> {
  const relativePath = path.join(PATHS.submissions, `${submissionId}.json`);
  console.warn(`Reading submission using assumed path: ${relativePath}. This might fail if filename includes timestamp.`);
  return await readJsonFileWithSchema<Submission>(relativePath, SubmissionSchema);
}

export async function listSubmissions(challengeId?: string): Promise<string[]> {
  const dataDirRoot = path.resolve(process.cwd(), 'data')
  const submissionsDir = path.resolve(dataDirRoot, PATHS.submissions)
  try {
    const files = await fs.readdir(submissionsDir)
    const submissions = files.filter(f => f.endsWith('.json'))
    if (challengeId) {
      return submissions.filter(f => f.startsWith(challengeId + '-')).map(f => f.replace('.json', ''))
    }
    return submissions.map(f => f.replace('.json', ''))
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    console.error("Failed to list submissions:", error)
    throw error
  }
}

// Feedback operations (Reinstated - needed by index.ts)
export function getFeedbackFilePath(submissionId: string): string {
  return path.join(PATHS.feedback, `${submissionId}.json`);
}

export async function writeFeedback(feedback: Feedback): Promise<void> {
  const filepath = getFeedbackFilePath(feedback.submissionId);
  await writeJsonFileWithSchema<Feedback>(filepath, feedback, FeedbackSchema);
}

export async function readFeedback(submissionId: string): Promise<Feedback | null> {
  const filepath = getFeedbackFilePath(submissionId);
  return await readJsonFileWithSchema<Feedback>(filepath, FeedbackSchema);
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
  const dataDirRoot = path.resolve(process.cwd(), 'data')
  const sourceDir = path.resolve(dataDirRoot, PATHS.submissions)
  const archiveBaseDir = path.resolve(dataDirRoot, PATHS.archive.submissions)
  const archiveMonthDir = path.join(archiveBaseDir, monthDir)
  const sourceFile = path.join(sourceDir, `${submissionId}.json`)
  const destFile = path.join(archiveMonthDir, `${submissionId}.json`)

  try {
    await fs.mkdir(archiveMonthDir, { recursive: true })
    await fs.rename(sourceFile, destFile)
    console.log(`Archived submission ${submissionId} to ${archiveMonthDir}`)
  } catch (error) {
    console.error(`Failed to archive submission ${submissionId}:`, error)
    throw error
  }
}

export async function archiveFeedback(submissionId: string): Promise<void> {
  const monthDir = getMonthDir()
  const dataDirRoot = path.resolve(process.cwd(), 'data')
  const sourceDir = path.resolve(dataDirRoot, PATHS.feedback)
  const archiveBaseDir = path.resolve(dataDirRoot, PATHS.archive.feedback)
  const archiveMonthDir = path.join(archiveBaseDir, monthDir)
  const sourceFile = path.join(sourceDir, `${submissionId}.json`)
  const destFile = path.join(archiveMonthDir, `${submissionId}.json`)

  try {
    await fs.mkdir(archiveMonthDir, { recursive: true })
    await fs.rename(sourceFile, destFile)
    console.log(`Archived feedback ${submissionId} to ${archiveMonthDir}`)
  } catch (error) {
    console.error(`Failed to archive feedback ${submissionId}:`, error)
    throw error
  }
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

// Generic file existence check
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath)
    return true
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

// Generic archive function
export async function archiveFile(sourcePath: string, targetArchiveBaseDir: string): Promise<void> {
  let filename = path.basename(sourcePath)
  const monthDir = getMonthDir()
  const archiveDirPath = path.join(targetArchiveBaseDir, monthDir)
  let targetPath = path.join(archiveDirPath, filename)

  await ensureDataDirectories()
  await fs.mkdir(archiveDirPath, { recursive: true })

  if (await fileExists(targetPath)) {
    const timestamp = Date.now()
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)
    const newFilename = `${base}-${timestamp}${ext}`
    targetPath = path.join(archiveDirPath, newFilename)
    console.warn(`Target archive path ${path.join(archiveDirPath, filename)} already exists. Renaming to ${targetPath}`)
  }
  
  console.log(`Archiving ${sourcePath} to ${targetPath}`)
  try {
    await fs.rename(sourcePath, targetPath)
  } catch (error) {
    console.error(`Error during fs.rename from ${sourcePath} to ${targetPath}:`, error)
    throw new Error(`Failed to archive file ${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Specific archive function for introduction.md
export async function archiveIntroduction(): Promise<void> {
  const sourcePath = path.join(PATHS.letters.toMentor, 'introduction.md')
  const targetArchiveBaseDir = PATHS.archive.letters

  try {
    if (await fileExists(sourcePath)) {
      await archiveFile(sourcePath, targetArchiveBaseDir)
      console.log(`Archived introduction.md successfully.`)
    } else {
      console.log('introduction.md not found in to-mentor, skipping archive.')
    }
  } catch (error) {
    console.error(`Error archiving introduction.md: ${error}`)
  }
}

// Export paths for use in other modules
export { PATHS } 