// src/scripts/process-letters.ts
import fs from 'fs/promises';
import path from 'path';
import { readConfig } from '../config'; // Assuming config loader exists
import { readStudentProfile, writeStudentProfile } from '../utils/profile-manager'; // Assuming these exist
import { generateLetterResponsePrompt, callGeminiAPI, parseLetterResponse } from '../utils/ai'; // Assuming these exist/need creation
import { sendEmail, formatLetterResponseEmail } from '../utils/email'; // Assuming these exist
import { loadMentorProfile } from '../profiles'; // Assuming profile loader exists
import { StudentProfile, Config, MentorProfile, LetterResponse } from '../types'; // Assuming types exist

const LETTERS_FROM_MENTOR_DIR = path.join('letters', 'from-mentor');
const LETTERS_ARCHIVE_DIR = path.join('letters', 'archive'); // Define a dedicated archive

async function processSingleLetter(letterPath: string, config: Config, profile: StudentProfile, mentor: MentorProfile): Promise<boolean> {
    console.log(`Processing letter: ${letterPath}`);
    try {
        const letterContent = await fs.readFile(letterPath, 'utf-8');

        // --- 1. Prepare AI Prompt ---
        // TODO: Need to implement context gathering (recent correspondence)
        const recentCorrespondence: string[] = []; // Placeholder
        const prompt = generateLetterResponsePrompt(letterContent, recentCorrespondence, profile, mentor); // Needs implementation

        // --- 2. Call AI API ---
        const rawResponse = await callGeminiAPI(prompt); // Assumes GEMINI_API_KEY is env var
        const mentorResponse: LetterResponse = parseLetterResponse(rawResponse); // Needs implementation

        // --- 3. Save Mentor Response ---
        const responseFileName = `${path.basename(letterPath, path.extname(letterPath))}-response.md`;
        const responseFilePath = path.join(LETTERS_FROM_MENTOR_DIR, responseFileName);
        await fs.mkdir(LETTERS_FROM_MENTOR_DIR, { recursive: true });
        await fs.writeFile(responseFilePath, mentorResponse.content); // Assuming response has a 'content' field
        console.log(`Mentor response saved to: ${responseFilePath}`);

        // --- 4. Update Student Profile ---
        // TODO: Implement logic to update profile based on interaction/response
        // profile.notes = profile.notes + `\nResponded to letter ${path.basename(letterPath)} on ${new Date().toISOString()}. Key points: ...`;
        // profile.lastUpdated = new Date().toISOString();
        // For now, just saving it back to update timestamp potentially
        profile.lastUpdated = new Date().toISOString(); // Update timestamp
        await writeStudentProfile(profile);

        // --- 5. Send Email ---
        const emailContent = formatLetterResponseEmail(mentorResponse, letterContent, config.emailStyle || 'casual'); // Use configured style // Needs implementation
        await sendEmail(config.userEmail, emailContent.subject, emailContent.body); // Assumes RESEND_API_KEY is env var
        console.log(`Email sent to: ${config.userEmail}`);

        // --- 6. Archive Processed Letter ---
        const archivePath = path.join(LETTERS_ARCHIVE_DIR, path.basename(letterPath));
        await fs.mkdir(LETTERS_ARCHIVE_DIR, { recursive: true });
        await fs.rename(letterPath, archivePath); // Move the original letter
        console.log(`Archived original letter to: ${archivePath}`);

        return true; // Indicate success

    } catch (error) {
        console.error(`Failed to process letter ${letterPath}:`, error);
        return false; // Indicate failure
    }
}

async function main() {
    const letterPaths = process.argv.slice(2); // Get file paths from command line arguments
    if (letterPaths.length === 0) {
        console.log("No letter paths provided to process.");
        return;
    }

    try {
        // Load necessary context once
        const config = await readConfig();
        const studentProfile = await readStudentProfile();
        const mentorProfile = await loadMentorProfile(config.mentorProfile); // Load the selected mentor profile // Needs implementation

        if (!mentorProfile) {
            throw new Error(`Mentor profile '${config.mentorProfile}' not found.`);
        }

        // TODO: Add logic to handle too many letters (limit, oldest first as per requirements)
        // For now, process all provided letters sequentially
        let successCount = 0;
        let failureCount = 0;

        // Ensure files are processed oldest first based on filename convention (e.g., timestamp) or mtime
        // Basic sort assuming filenames might contain sortable date info (e.g., YYYYMMDD-...) 
        // A more robust approach might use fs.stat to get mtime.
        const sortedLetterPaths = letterPaths.sort(); 
        
        // TODO: Add truncation logic here if needed
        const lettersToProcess = sortedLetterPaths; // Replace with truncated list if necessary

        for (const letterPath of lettersToProcess) {
            const success = await processSingleLetter(letterPath, config, studentProfile, mentorProfile);
            if (success) {
                successCount++;
            } else {
                failureCount++;
            }
        }

        console.log(`\nProcessing complete. Success: ${successCount}, Failures: ${failureCount}`);
        if (failureCount > 0) {
            // Optionally notify user about failures
            // Maybe create a report file?
            console.error(`${failureCount} letters failed to process.`);
            process.exit(1); // Exit with error if any letter failed
        }

    } catch (error) {
        console.error("Critical error during letter processing:", error);
        process.exit(1);
    }
}

main(); 