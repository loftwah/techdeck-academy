import fs from 'fs/promises';
import path from 'path';

const LETTERS_DIR = path.join('letters', 'to-mentor');

/**
 * Identifies new letter files in the designated directory.
 * For now, it simply lists all files in the directory.
 * More sophisticated tracking (e.g., based on commit history or a status file)
 * could be added later to prevent reprocessing.
 */
async function findNewLetters(): Promise<string[]> {
    try {
        const entries = await fs.readdir(LETTERS_DIR, { withFileTypes: true });
        const files = entries
            .filter(entry => entry.isFile())
            // Optionally filter out specific file types or patterns if needed
            // .filter(entry => entry.name.endsWith('.md') || entry.name.endsWith('.txt'))
            .map(entry => path.join(LETTERS_DIR, entry.name)); // Get full relative path

        return files;
    } catch (error: any) {
        // If the directory doesn't exist or is empty, return an empty array
        if (error.code === 'ENOENT') {
            console.warn(`Directory not found: ${LETTERS_DIR}. Assuming no new letters.`);
            return [];
        }
        console.error('Error finding new letters:', error);
        // Re-throw or exit if it's a critical error
        throw error; // Or process.exit(1);
    }
}

findNewLetters()
    .then(files => {
        // Output file paths separated by spaces for GitHub Actions
        process.stdout.write(files.join(' '));
    })
    .catch(() => {
        process.exit(1); // Exit with error code if the function failed
    }); 