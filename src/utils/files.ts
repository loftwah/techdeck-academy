import { promises as fs } from 'fs'
import path from 'path'
import type { Challenge, Submission, Feedback, StudentProfile } from '../types.js'
import { ChallengeSchema, SubmissionSchema, FeedbackSchema } from '../schemas.js'
import { ZodError } from 'zod'

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

export async function readChallenge(challengeId: string): Promise<Challenge | null> {
  const filepath = path.join(PATHS.challenges, `${challengeId}.json`)
  try {
    const content = await fs.readFile(filepath, 'utf-8')
    const jsonData = JSON.parse(content);
    const result = ChallengeSchema.safeParse(jsonData);
    if (result.success) {
        return result.data;
    } else {
        console.error(`Invalid challenge file content for ${challengeId}:`, result.error.errors);
        return null; 
    }
  } catch (error) {
      if (error instanceof SyntaxError) {
          console.error(`Invalid JSON syntax in challenge file ${challengeId}:`, error);
      } else if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.warn(`Challenge file not found: ${filepath}`);
      } else {
        console.error(`Error reading challenge file ${filepath}:`, error);
      }
      return null;
  }
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

export async function readSubmission(submissionId: string): Promise<Submission | null> {
  const filepath = path.join(PATHS.submissions, `${submissionId}.json`)
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const jsonData = JSON.parse(content);
    const result = SubmissionSchema.safeParse(jsonData);
     if (result.success) {
        return result.data;
    } else {
        console.error(`Invalid submission file content for ${submissionId}:`, result.error.errors);
        return null; 
    }
  } catch (error) {
      if (error instanceof SyntaxError) {
          console.error(`Invalid JSON syntax in submission file ${submissionId}:`, error);
      } else if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.warn(`Submission file not found: ${filepath}`);
      } else {
          console.error(`Error reading submission file ${filepath}:`, error);
      }
      return null; 
  }
}

export async function listSubmissions(challengeId?: string): Promise<string[]> {
  const files = await fs.readdir(PATHS.submissions)
  const submissions = files.filter(f => f.endsWith('.json'))
  if (challengeId) {
    return submissions.filter(f => f.startsWith(challengeId))
  }
  return submissions.map(f => f.replace('.json', ''))
}

// Feedback operations (Reinstated - needed by index.ts)
export async function writeFeedback(feedback: Feedback): Promise<void> {
  const filename = `${feedback.submissionId}.json`; // Feedback is keyed by submissionId
  const filepath = path.join(PATHS.feedback, filename);
  await fs.writeFile(filepath, JSON.stringify(feedback, null, 2));
}

export async function readFeedback(submissionId: string): Promise<Feedback | null> {
  const filepath = path.join(PATHS.feedback, `${submissionId}.json`);
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const jsonData = JSON.parse(content);
    const result = FeedbackSchema.safeParse(jsonData);
     if (result.success) {
        return result.data;
    } else {
        console.error(`Invalid feedback file content for submission ${submissionId}:`, result.error.errors);
        return null; 
    }
  } catch (error) {
       if (error instanceof SyntaxError) {
          console.error(`Invalid JSON syntax in feedback file for ${submissionId}:`, error);
      } else if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.warn(`Feedback file not found: ${filepath}`);
      } else {
          console.error(`Error reading feedback file ${filepath}:`, error);
      }
      return null; 
  }
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

// Generic file existence check
export async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath); // Check if file is accessible
    return true;
  } catch (error) {
    // If error code is ENOENT (File not found), return false
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    // Re-throw other errors (e.g., permissions)
    throw error;
  }
}

// Generic archive function
export async function archiveFile(sourcePath: string, targetArchiveBaseDir: string): Promise<void> {
  let filename = path.basename(sourcePath);
  const monthDir = getMonthDir(); // Use existing helper for YYYY-MM subdirectory
  const archiveDirPath = path.join(targetArchiveBaseDir, monthDir);
  let targetPath = path.join(archiveDirPath, filename);

  await ensureDirectories(); // Ensure base directories exist first
  await fs.mkdir(archiveDirPath, { recursive: true }); // Ensure the specific month archive dir exists

  // Check if target file already exists
  if (await fileExists(targetPath)) {
    const timestamp = Date.now();
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const newFilename = `${base}-${timestamp}${ext}`;
    targetPath = path.join(archiveDirPath, newFilename);
    console.warn(`Target archive path ${path.join(archiveDirPath, filename)} already exists. Renaming to ${targetPath}`);
  }
  
  console.log(`Archiving ${sourcePath} to ${targetPath}`); // Add logging
  try {
      await fs.rename(sourcePath, targetPath); // Move the file
  } catch (error) {
      console.error(`Error during fs.rename from ${sourcePath} to ${targetPath}:`, error);
      // Re-throw the error to indicate archiving failed
      throw new Error(`Failed to archive file ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Specific archive function for introduction.md
export async function archiveIntroduction(): Promise<void> {
  const sourcePath = path.join(PATHS.letters.toMentor, 'introduction.md');
  const targetArchiveBaseDir = PATHS.archive.letters; // Archive with other letters

  try {
    if (await fileExists(sourcePath)) {
      await archiveFile(sourcePath, targetArchiveBaseDir);
      console.log(`Archived introduction.md successfully.`);
    } else {
      console.log('introduction.md not found in to-mentor, skipping archive.');
    }
  } catch (error) {
    console.error(`Error archiving introduction.md: ${error}`);
    // Decide if we should re-throw or just log
  }
}

// Export paths for use in other modules
export { PATHS } 