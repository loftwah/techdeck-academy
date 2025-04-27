import fs from 'fs/promises';
import path from 'path';
import { z, ZodError, ZodType } from 'zod';

export class FileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = 'FileNotFoundError';
  }
}

export class FileParsingError extends Error {
  constructor(filePath: string, originalError: Error) {
    super(`Error parsing file ${filePath}: ${originalError.message}`);
    this.name = 'FileParsingError';
    this.cause = originalError;
  }
}

export class FileValidationError extends Error {
  constructor(filePath: string, validationErrors: z.ZodIssue[]) {
    const issues = validationErrors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    super(`Invalid data found in ${filePath}. Issues: ${issues}`);
    this.name = 'FileValidationError';
    this.cause = validationErrors;
  }
}

export class FileWriteError extends Error {
  constructor(filePath: string, originalError: Error) {
    super(`Error writing file ${filePath}: ${originalError.message}`);
    this.name = 'FileWriteError';
    this.cause = originalError;
  }
}


/**
 * Reads a JSON file, parses it, and validates it against a Zod schema.
 * Returns null if the file does not exist.
 * Throws FileParsingError for JSON syntax errors.
 * Throws FileValidationError for schema validation errors.
 * Throws other errors for filesystem issues.
 */
export async function readJsonFileWithSchema<T>(
  relativeFilePath: string,
  schema: ZodType<T>
): Promise<T | null> {
  const absolutePath = path.resolve(process.cwd(), relativeFilePath);
  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Return null specifically for file not found
      return null;
    }
    // Re-throw other filesystem errors
    throw error; // Or wrap in a custom error if preferred
  }

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FileParsingError(relativeFilePath, error);
    }
    throw error; // Re-throw unexpected errors during parsing
  }

  const validationResult = schema.safeParse(parsedData);
  if (!validationResult.success) {
    throw new FileValidationError(relativeFilePath, validationResult.error.errors);
  }

  return validationResult.data;
}

/**
 * Validates data (or optional separate data for validation) against a Zod schema and writes the primary data to a JSON file.
 * Creates directories if they don't exist.
 * Throws ZodError if the data to validate is invalid *before* writing.
 * Throws FileWriteError for filesystem issues during writing.
 */
export async function writeJsonFileWithSchema<T>(
  relativeFilePath: string,
  data: T, // The data object to be WRITTEN to the file
  schema: ZodType<T>,
  dataToValidate?: T // Optional: A potentially different object to VALIDATE against the schema
): Promise<void> {
  // Use the provided dataToValidate if available, otherwise default to validating the data being written
  const objectToValidate = dataToValidate !== undefined ? dataToValidate : data;
  
  // Validate the object designated for validation
  const validationResult = schema.safeParse(objectToValidate);
  if (!validationResult.success) {
    // Throw ZodError directly for invalid data provided for validation
     throw new ZodError(validationResult.error.errors);
  }

  const absolutePath = path.resolve(process.cwd(), relativeFilePath);
  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    // IMPORTANT: Stringify and write the main 'data' object, NOT necessarily the validated one
    const content = JSON.stringify(data, null, 2); 
    await fs.writeFile(absolutePath, content, 'utf-8');
  } catch (error) {
     if (error instanceof Error) {
        throw new FileWriteError(relativeFilePath, error);
     }
     throw error; // Re-throw unexpected errors
  }
} 