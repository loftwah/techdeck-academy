import path from 'path'
import { promises as fs } from 'fs'
import type { Challenge, Submission, Feedback } from '../types.js'
import { ChallengeSchema, SubmissionSchema, FeedbackSchema } from '../schemas.js'
import { readJsonFileWithSchema, writeJsonFileWithSchema } from './file-operations.js'

// Base paths for different file types (Root relative)
export const PATHS = {
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
  const relativePaths = getAllPaths(PATHS); // Use original PATHS

  for (const dirPath of relativePaths) {
    try {
      // Use path relative to cwd
      await fs.mkdir(path.resolve(process.cwd(), dirPath), { recursive: true });
    } catch (error) {
      // Make error message clearer
      console.error(`Failed to ensure directory ${path.resolve(process.cwd(), dirPath)}:`, error);
    }
  }
}

// Challenge operations
export function getChallengeFilePath(challengeId: string): string {
  // Use original PATHS
  return path.join(PATHS.challenges, `${challengeId}.json`)
}

export async function writeChallenge(challenge: Challenge): Promise<void> {
  const filepath = getChallengeFilePath(challenge.id)
  // Assume writeJsonFileWithSchema handles prepending cwd if necessary or works with relative paths
  await writeJsonFileWithSchema(filepath, challenge, ChallengeSchema)
}

export async function readChallenge(challengeId: string): Promise<Challenge | null> {
  const filepath = getChallengeFilePath(challengeId)
  // Assume readJsonFileWithSchema handles prepending cwd if necessary or works with relative paths
  return await readJsonFileWithSchema<Challenge>(filepath, ChallengeSchema)
}

export async function listChallenges(): Promise<string[]> {
  // Assume readdir works with root-relative path
  const challengesDir = path.resolve(process.cwd(), PATHS.challenges);
  try {
    const files = await fs.readdir(challengesDir)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  } catch (error) {
     if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      await ensureDataDirectories(); // Attempt to create dir if missing
      return []; // Return empty if dir didn't exist initially
    }
    console.error("Failed to list challenges:", error)
    throw error
  }
}

// Submission operations
export async function writeSubmission(submission: Submission): Promise<string> {
  const submissionId = `${submission.challengeId}-${Date.now()}`;
  const filename = `${submissionId}.json`;
  const filepath = path.join(PATHS.submissions, filename); // Use original PATHS
  // Assume writeJsonFileWithSchema works with root-relative path
  await writeJsonFileWithSchema<Submission>(filepath, submission, SubmissionSchema);
  return submissionId;
}

export async function readSubmission(submissionId: string): Promise<Submission | null> {
  const filepath = path.join(PATHS.submissions, `${submissionId}.json`); // Use original PATHS
  console.warn(`Reading submission using assumed path: ${filepath}. This might fail if filename includes timestamp.`);
  // Assume readJsonFileWithSchema works with root-relative path
  return await readJsonFileWithSchema<Submission>(filepath, SubmissionSchema);
}

export async function listSubmissions(challengeId?: string): Promise<string[]> {
  const submissionsDir = path.resolve(process.cwd(), PATHS.submissions)
  try {
    const files = await fs.readdir(submissionsDir)
    const submissions = files.filter(f => f.endsWith('.json'))
    if (challengeId) {
      return submissions.filter(f => f.startsWith(challengeId + '-')).map(f => f.replace('.json', ''))
    }
    return submissions.map(f => f.replace('.json', ''))
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      await ensureDataDirectories(); // Attempt to create dir if missing
      return []
    }
    console.error("Failed to list submissions:", error)
    throw error
  }
}

// Feedback operations
export function getFeedbackFilePath(submissionId: string): string {
  // Use original PATHS
  return path.join(PATHS.feedback, `${submissionId}.json`);
}

export async function writeFeedback(feedback: Feedback): Promise<void> {
  const filepath = getFeedbackFilePath(feedback.submissionId);
  // Assume writeJsonFileWithSchema works with root-relative path
  await writeJsonFileWithSchema<Feedback>(filepath, feedback, FeedbackSchema);
}

export async function readFeedback(submissionId: string): Promise<Feedback | null> {
  const filepath = getFeedbackFilePath(submissionId);
  // Assume readJsonFileWithSchema works with root-relative path
  return await readJsonFileWithSchema<Feedback>(filepath, FeedbackSchema);
}

// Archive operations
export async function archiveChallenge(challengeId: string): Promise<void> {
  // Assuming readChallenge returns data or null
  const challenge = await readChallenge(challengeId);
  if (!challenge) {
    console.error(`Challenge ${challengeId} not found, cannot archive.`);
    return; // Exit if challenge doesn't exist
  }
  const monthDir = getMonthDir()
  const sourcePath = path.resolve(process.cwd(), getChallengeFilePath(challengeId))
  const archivePath = path.resolve(process.cwd(), PATHS.archive.challenges, monthDir)
  const destPath = path.join(archivePath, `${challengeId}.json`)

  try {
    await fs.mkdir(archivePath, { recursive: true })
    await fs.rename(sourcePath, destPath)
    console.log(`Archived challenge ${challengeId} to ${archivePath}`)
  } catch (error) {
     console.error(`Failed to archive challenge ${challengeId}:`, error)
    throw error
  }
}

export async function archiveSubmission(submissionId: string): Promise<void> {
  const monthDir = getMonthDir()
  const sourceFile = path.resolve(process.cwd(), PATHS.submissions, `${submissionId}.json`)
  const archiveMonthDir = path.resolve(process.cwd(), PATHS.archive.submissions, monthDir)
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
  const sourceFile = path.resolve(process.cwd(), PATHS.feedback, `${submissionId}.json`)
  const archiveMonthDir = path.resolve(process.cwd(), PATHS.archive.feedback, monthDir)
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
    // Ensure path is absolute
    const absolutePath = path.resolve(process.cwd(), filepath);
    const stats = await fs.stat(absolutePath)
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
    return ageInDays > days
  } catch {
    return false
  }
}

// Generic file existence check
export async function fileExists(filepath: string): Promise<boolean> {
  try {
     // Ensure path is absolute
    const absolutePath = path.resolve(process.cwd(), filepath);
    await fs.access(absolutePath)
    return true
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    // Log other errors for debugging
    console.error(`Error checking file existence for ${filepath}:`, error);
    return false; // Treat other errors as file not existing for robustness? Or rethrow?
    // throw error // Rethrow if strict error handling is needed
  }
}

// Generic archive function
export async function archiveFile(sourcePath: string, targetArchiveBaseDir: string): Promise<void> {
  let filename = path.basename(sourcePath)
  const monthDir = getMonthDir()
  // Ensure paths are absolute
  const absoluteSourcePath = path.resolve(process.cwd(), sourcePath)
  const absoluteArchiveBaseDir = path.resolve(process.cwd(), targetArchiveBaseDir)
  const archiveDirPath = path.join(absoluteArchiveBaseDir, monthDir)
  let targetPath = path.join(archiveDirPath, filename)

  // Don't call ensureDataDirectories here, rely on specific function calls
  await fs.mkdir(archiveDirPath, { recursive: true })

  // Check existence using absolute path
  if (await fileExists(targetPath)) {
    const timestamp = Date.now()
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)
    const newFilename = `${base}-${timestamp}${ext}`
    targetPath = path.join(archiveDirPath, newFilename)
    console.warn(`Target archive path ${path.join(archiveDirPath, filename)} already exists. Renaming to ${targetPath}`)
  }

  console.log(`Archiving ${absoluteSourcePath} to ${targetPath}`)
  try {
    await fs.rename(absoluteSourcePath, targetPath)
  } catch (error) {
    console.error(`Error during fs.rename from ${absoluteSourcePath} to ${targetPath}:`, error)
    throw new Error(`Failed to archive file ${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Specific archive function for introduction.md
export async function archiveIntroduction(): Promise<void> {
  const sourcePath = path.join(PATHS.letters.toMentor, 'introduction.md')
  const targetArchiveBaseDir = PATHS.archive.letters // Root-relative path

  try {
    if (await fileExists(sourcePath)) { // fileExists handles making path absolute
      await archiveFile(sourcePath, targetArchiveBaseDir)
      console.log(`Archived introduction.md successfully.`)
    } else {
      console.log('introduction.md not found in to-mentor, skipping archive.')
    }
  } catch (error) {
     console.error('Error during introduction.md archive:', error);
     // Decide if this should throw or just log
  }
} 