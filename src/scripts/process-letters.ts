// src/scripts/process-letters.ts
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js'; // Use the direct config import
import * as profileManager from '../utils/profile-manager.js';
import * as ai from '../utils/ai.js';
import * as email from '../utils/email.js';
import * as files from '../utils/files.js'; // For archiving and directory management
import { readAIMemoryRaw } from '../utils/ai-memory-manager.js'; // Import memory reader
import type { StudentProfile, Config, MentorProfile, LetterResponse } from '../types.js';

async function processSingleLetter(letterPath: string, config: Config, aiMemory: string, mentor: MentorProfile, studentStatus: string): Promise<boolean> {
    console.log(`Processing letter: ${letterPath}`);
    const letterFilename = path.basename(letterPath);
    try {
        const letterContent = await fs.readFile(letterPath, 'utf-8');

        // Basic content validation
        if (!letterContent || letterContent.trim().length === 0) {
            console.warn(`Skipping empty letter file: ${letterPath}`);
            // Should we archive empty files? For now, just skip.
            return false; // Indicate failure/skip
        }
        // TODO: Add size check? e.g., if (letterContent.length > MAX_LETTER_SIZE) ...

        // --- 1. Generate AI Response ---
        const recentCorrespondence: string[] = []; // Placeholder for now
        const mentorResponse = await ai.generateLetterResponse(
            letterContent,
            recentCorrespondence,
            aiMemory, // Pass AI Memory string
            mentor.name, // Pass mentor name
            config,
            studentStatus // Pass the status
        );

        // --- 2. Save Mentor Response ---
        const responseFileName = `${path.basename(letterFilename, path.extname(letterFilename))}-response.md`;
        const responseFilePath = path.join(files.PATHS.letters.fromMentor, responseFileName);
        await files.ensureDirectories(); // Corrected function name
        await fs.writeFile(responseFilePath, mentorResponse.content);
        console.log(`Mentor response saved to: ${responseFilePath}`);

        // --- 3. Update Student Profile (via insights -> AI Memory) ---
        // Pass config to updateProfileFromLetterInsights
        await profileManager.updateProfileFromLetterInsights(config, mentorResponse.insights);
        
        // --- 4. Send Email ---
        if (config.notifications?.emailMentions !== false) { // Check notification preference
            const emailContent = await email.formatLetterResponseEmail(
                mentorResponse,
                letterContent,
                config.emailStyle || 'casual',
                mentor.name
            );
            // Pass config and content object to sendEmail
            await email.sendEmail(config, emailContent);
            console.log(`Email sent to: ${config.userEmail}`);
        } else {
            console.log('Email notifications for letters are disabled in config.');
        }

        // --- 5. Archive Processed Letter ---
        // Use the generic archiveFile function with the correct base archive path from files.PATHS
        await files.archiveFile(letterPath, files.PATHS.archive.letters); // Use base letters archive path
        // Construct the expected final archive path for logging based on how archiveFile works
        const monthDir = new Date().toISOString().slice(0, 7); // YYYY-MM
        const expectedArchivePath = path.join(files.PATHS.archive.letters, monthDir, path.basename(letterPath));
        console.log(`Archived original letter to: ${expectedArchivePath}`); // Log calculated path

        return true; // Indicate success

    } catch (error) {
        console.error(`Failed to process letter ${letterFilename}:`, error);
        // Optional: Move to a 'failed' directory instead of archiving?
        // For now, we just log the error and return false.
        return false; // Indicate failure
    }
}

async function main() {
    const letterPaths = process.argv.slice(2); // Get file paths from command line arguments
    if (letterPaths.length === 0) {
        console.log("No letter paths provided to process. Exiting.");
        // Instead of exiting, maybe find new letters automatically?
        // For now, relies on external trigger passing paths.
        return;
    }

    console.log(`Received ${letterPaths.length} letters to process.`);

    try {
        // Load necessary context once
        const mentorProfile = await profileManager.loadMentorProfile(config.mentorProfile);
        const aiMemory = await readAIMemoryRaw(); // Read AI memory once
        let studentProfile = await profileManager.readStudentProfile(config); // Read profile once at start

        // Check if profile loaded
        if (!studentProfile) {
            console.error("CRITICAL: Failed to load or validate student profile. Cannot process letters.");
            // TODO: Send error email?
            process.exit(1); // Exit with error
        }

        if (!mentorProfile) {
            // loadMentorProfile logs a warning and returns a default, so this check might not be strictly needed
            // but kept for clarity.
            console.error(`Critical error: Mentor profile '${config.mentorProfile}' could not be loaded.`);
            process.exit(1);
        }

        let successCount = 0;
        let failureCount = 0;

        // Process letters one by one
        for (const letterPath of letterPaths) {
            const letterFilename = path.basename(letterPath);

            // Check if file exists before processing using the new function
            if (!await files.fileExists(letterPath)) {
                console.warn(`Letter file not found, skipping: ${letterPath}`);
                continue;
            }
            
            // --- Special handling for introduction.md --- REMOVED
            // if (letterFilename === 'introduction.md') { ... }
            // --- End special handling ---

            // Pass aiMemory AND student status instead of profile snapshot
            // Provide default status if somehow undefined after reading
            const success = await processSingleLetter(letterPath, config, aiMemory, mentorProfile, studentProfile.status);
            if (success) {
                successCount++;
                // --- Check if this was the first interaction ---
                if (studentProfile.status === 'awaiting_introduction') {
                    console.log('First letter successfully processed, setting profile status to active.');
                    // Pass config to setProfileStatusActive
                    await profileManager.setProfileStatusActive(config);
                    // Reload profile state ONLY IF status change affects subsequent letters in THIS batch
                    // Reading again to get the updated status
                    const updatedProfile = await profileManager.readStudentProfile(config);
                    if (!updatedProfile) { // Check again, though unlikely to fail now
                         console.error("CRITICAL: Failed to reload profile after status update. Exiting.");
                         process.exit(1);
                    }
                    studentProfile = updatedProfile; 
                }
            } else {
                failureCount++;
            }
        }

        console.log(`\nProcessing complete. Success: ${successCount}, Failures: ${failureCount}`);

        if (failureCount > 0) {
            console.error(`${failureCount} letters failed to process.`);
            // Consider sending an error email if configured
            if (config.notifications?.emailErrors) {
                try {
                    // Format error email content correctly
                    const errorEmailContent = {
                        subject: 'TechDeck Academy - Letter Processing Errors',
                        html: baseTemplate(`The letter processing script encountered ${failureCount} errors. Please check the server logs for details.`)
                    };
                    await email.sendEmail(config, errorEmailContent);
                } catch (emailError) {
                    console.error("Failed to send error notification email:", emailError);
                }
            }
            process.exit(1); // Exit with error code if any letter failed
        }

    } catch (error) {
        console.error("Critical error during letter processing setup:", error);
        // Consider sending an error email if configured
        if (config.notifications?.emailErrors) {
            try {
                 // Format critical error email content correctly
                const criticalErrorEmailContent = {
                    subject: 'TechDeck Academy - CRITICAL Letter Processing Error',
                    html: baseTemplate(`The letter processing script failed during setup. Please check the server logs immediately. Error: ${error instanceof Error ? error.message : String(error)}`)
                };
                await email.sendEmail(config, criticalErrorEmailContent);
            } catch (emailError) {
                console.error("Failed to send critical error notification email:", emailError);
            }
        }
        process.exit(1);
    }
}

// Import baseTemplate if needed for error emails
import { baseTemplate } from '../utils/email.js';

main().catch(err => {
    console.error("Unhandled error in main execution:", err);
    process.exit(1);
}); 