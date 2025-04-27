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

/**
 * @deprecated Submissions are now directories. Use directory-based functions instead.
 */
export async function writeSubmission(submission: Submission): Promise<string> {
  console.warn("writeSubmission is deprecated. Submissions are now directories.");
  const submissionId = `${submission.challengeId}-${Date.now()}`;
  const filename = `${submissionId}.json`; // This doesn't fit the new model
  const filepath = path.join(PATHS.submissions, filename);
  // This logic assumes a single JSON file, which is incorrect now.
  // await writeJsonFileWithSchema<Submission>(filepath, submission, SubmissionSchema);
  // Returning an ID based on old format for compatibility where needed, but this is flawed.
  return submissionId;
}

/**
 * @deprecated Submissions are now directories. Use readSubmissionDirectoryContent instead.
 */
export async function readSubmission(submissionId: string): Promise<Submission | null> {
  console.warn("readSubmission is deprecated. Submissions are now directories.");
  // This function assumes a specific JSON file naming convention that no longer applies.
  return null;
}

/**
 * Reads all file contents within a submission directory and concatenates them.
 * Includes filenames as separators. Skips '.DS_Store' and other common noise files.
 * @param submissionDirPath The path to the submission directory (e.g., 'submissions/CC-123').
 * @returns A promise that resolves to the concatenated content string or null if dir doesn't exist.
 */
export async function readSubmissionDirectoryContent(submissionDirPath: string): Promise<string | null> {
  const absoluteDirPath = path.resolve(process.cwd(), submissionDirPath);
  const ignoredFiles = ['.DS_Store', 'Thumbs.db']; // Files/dirs to ignore

  try {
    const dirents = await fs.readdir(absoluteDirPath, { withFileTypes: true });
    let combinedContent = `Submission content for directory: ${submissionDirPath}\n\n`;

    for (const dirent of dirents) {
      if (ignoredFiles.includes(dirent.name)) {
        continue; // Skip ignored files
      }
      
      const fullPath = path.join(absoluteDirPath, dirent.name);
      if (dirent.isFile()) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          combinedContent += `--- File: ${dirent.name} ---\n`;
          combinedContent += content;
          combinedContent += '\n\n';
        } catch (readError) {
           console.error(`Error reading file ${fullPath}:`, readError);
           combinedContent += `--- File: ${dirent.name} (Error reading) ---\n\n`;
        }
      } else if (dirent.isDirectory()) {
        // Optional: Recursively read subdirectories? For now, just note its presence.
        combinedContent += `--- Directory: ${dirent.name} ---\n\n`;
      }
    }
    return combinedContent;
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`Submission directory not found: ${absoluteDirPath}`);
      return null;
    }
    console.error(`Error reading submission directory ${absoluteDirPath}:`, error);
    throw error; // Rethrow other errors
  }
}

/**
 * Lists directories within the submissions folder.
 * Optionally filters by challengeId prefix if the directory name starts with it.
 * @param challengeId Optional challenge ID prefix (e.g., 'CC-123') to filter directories.
 * @returns A promise that resolves to an array of directory names (relative to PATHS.submissions).
 */
export async function listSubmissions(challengeId?: string): Promise<string[]> {
  const submissionsDir = path.resolve(process.cwd(), PATHS.submissions);
  try {
    // Use withFileTypes to easily filter for directories
    const dirents = await fs.readdir(submissionsDir, { withFileTypes: true });
    const directories = dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (challengeId) {
      // Filter directories that start with the challengeId
      return directories.filter(dirName => dirName.startsWith(challengeId));
    }
    return directories;
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      await ensureDataDirectories(); // Attempt to create dir if missing
      return [];
    }
    console.error("Failed to list submission directories:", error);
    throw error;
  }
}

// Feedback operations

// Modified: Now accepts an optional filenameId to decouple filename from data.submissionId
export function getFeedbackFilePath(identifier: string): string {
  // Identifier is now either the original submissionId OR the filenameId
  return path.join(PATHS.feedback, `${identifier}.json`);
}

/**
 * Writes feedback data to a file.
 * 
 * @param feedback The original, validated Feedback object (with correct submissionId).
 * @param filenameId Optional. If provided, this ID (e.g., challengeId + timestamp) is used 
 *                   for the filename, and the submissionId *within the written file* will also
 *                   be set to this filenameId. If omitted, the filename and the submissionId
 *                   within the file will be taken from feedback.submissionId.
 */
export async function writeFeedback(feedback: Feedback, filenameId?: string): Promise<void> {
  // Determine the ID to use for the filename and potentially within the data
  const effectiveId = filenameId ?? feedback.submissionId;
  const filepath = getFeedbackFilePath(effectiveId);

  // Prepare the data object to be actually written to the file
  // If a specific filenameId was given, use it *inside* the data object too,
  // otherwise, the data object remains unchanged.
  const dataToWrite = filenameId ? { ...feedback, submissionId: filenameId } : feedback;

  // Call the helper, passing:
  // 1. The final filepath.
  // 2. The data object potentially modified for the file (dataToWrite).
  // 3. The schema.
  // 4. The ORIGINAL feedback object for validation purposes.
  await writeJsonFileWithSchema<Feedback>(
    filepath,          // Use the path derived from effectiveId
    dataToWrite,       // Write the potentially modified data
    FeedbackSchema,    // The schema to use
    feedback           // Validate the ORIGINAL feedback object
  );
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

/**
 * Archives a specific submission *directory* by moving it into a dated archive folder.
 * @param submissionDirName The name of the submission directory (e.g., 'CC-123').
 */
export async function archiveSubmission(submissionDirName: string): Promise<void> {
  const monthDir = getMonthDir();
  const sourceDir = path.resolve(process.cwd(), PATHS.submissions, submissionDirName);
  const archiveMonthDir = path.resolve(process.cwd(), PATHS.archive.submissions, monthDir);
  const destDir = path.join(archiveMonthDir, submissionDirName); // Move the whole directory

  try {
    // Ensure the dated archive directory exists
    await fs.mkdir(archiveMonthDir, { recursive: true });

    // Check if source directory exists before attempting move
    if (!await fileExists(sourceDir)) {
       console.warn(`Submission directory to archive not found: ${sourceDir}`);
       return; // Don't throw error, just log and return
    }

    // Move the entire directory
    await fs.rename(sourceDir, destDir);
    console.log(`Archived submission directory ${submissionDirName} to ${archiveMonthDir}`);
  } catch (error) {
    console.error(`Failed to archive submission directory ${submissionDirName}:`, error);
    // Don't rethrow, allow workflow to continue if possible? Or should it fail?
    // Depending on context, might want to rethrow: throw error;
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