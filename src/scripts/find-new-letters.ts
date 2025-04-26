import fs from 'fs/promises';
import path from 'path';
import { PATHS } from '../utils/files.js'; // Import PATHS

// Use the constant from files.ts
const LETTERS_DIR = PATHS.letters.toMentor; 

/**
 * Identifies new letter files in the designated directory.
 * For now, it simply lists all files in the directory.
 * More sophisticated tracking (e.g., based on commit history or a status file)
 * could be added later to prevent reprocessing.
 */
async function findNewLetters(): Promise<string[]> {
    console.log(`Checking for new letters in: ${LETTERS_DIR}`);
    try {
        const entries = await fs.readdir(LETTERS_DIR, { withFileTypes: true });
        const files = entries
            .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'introduction.md')
            .map(entry => path.join(LETTERS_DIR, entry.name)); // Get full relative path

        console.log(`Found ${files.length} new letter(s): ${files.join(', ') || 'None'}`);
        return files;
    } catch (error: any) {
        // If the directory doesn't exist or is empty, return an empty array
        if (error.code === 'ENOENT') {
            console.warn(`Letters directory not found: ${LETTERS_DIR}. Assuming no new letters.`);
            return [];
        }
        console.error('Error finding new letters:', error);
        // Re-throw or exit if it's a critical error
        throw error; // Or process.exit(1);
    }
}

async function main() {
    try {
        const newLetters = await findNewLetters();
        // Output the list of files, one per line, for consumption by other scripts/workflows
        if (newLetters.length > 0) {
            console.log("\n--- START FILE LIST ---");
            newLetters.forEach(file => console.log(file));
            console.log("--- END FILE LIST ---");
        }
    } catch (error) {
        console.error("Failed to find new letters:", error);
        process.exit(1);
    }
}

main(); 