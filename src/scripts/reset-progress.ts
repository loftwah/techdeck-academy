import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { config } from '../config.js'; // Import the config object

// Directories and files to remove/reset
const ITEMS_TO_DELETE = [
    'student-profile.json', // File to delete
    // 'ai-memory.md', // File to reset, not delete
    'challenges',       // Directory to delete
    'submissions',      // Directory to delete
    'feedback',         // Directory to delete
    'letters',          // Directory to delete
    'progress',         // Directory to delete
    'archive'           // Directory to delete
];

// Directories that must exist after reset
const DIRS_TO_ENSURE = [
    'challenges',
    'submissions',
    'feedback',
    'letters/to-mentor',
    'letters/from-mentor',
    'letters/archive',
    'progress/weekly',
    'progress/monthly',
    'progress/quarterly',
    'progress/cleanup-reports',
    'archive/challenges',
    'archive/submissions',
    'archive/feedback',
    'archive/letters'
];

// Directories needing a .keep file
const DIRS_NEEDING_KEEP = [
    'challenges',
    'submissions',
    'feedback',
    'letters/to-mentor',
    'letters/from-mentor',
    'letters/archive',
    'progress/weekly',
    'progress/monthly',
    'progress/quarterly',
    'progress/cleanup-reports',
    'archive/challenges',
    'archive/submissions',
    'archive/feedback',
    'archive/letters'
];

// Default content for ai-memory.md
const DEFAULT_AI_MEMORY_CONTENT = `# AI Teacher's Notes for [Student Name/ID]
Last Updated: 2024-01-01T00:00:00.000Z

## System Definitions

### Challenge Types
This application uses the following challenge types:
*   **coding**: Standard programming exercise with requirements and examples.
*   **iac**: Infrastructure as Code task (Terraform, Dockerfile, K8s, etc.) involving defining resources.
*   **question**: Conceptual or short research question requiring a text answer.
*   **mcq**: Multiple Choice Question with options provided.
*   **design**: System design scenario requiring outlining a solution.
*   **casestudy**: Analysis of a provided technical case study.
*   **project**: Small, multi-step project outline.

---

## Current Snapshot (~500 chars)
Initial state. Waiting for first interaction.

## Recent Activity (~1500 chars - Rolling Log)
*   No activity logged yet.

---

## Long-Term History & Patterns (~2000 chars - Summarized)
*   No history recorded yet.
`;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function deleteItem(itemPath: string): Promise<void> {
    try {
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
            await fs.rm(itemPath, { recursive: true, force: true });
            console.log(`Deleted directory: ${itemPath}`);
        } else {
            await fs.rm(itemPath, { force: true });
            console.log(`Deleted file:      ${itemPath}`);
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // console.log(`Item not found, skipping: ${itemPath}`);
        } else {
            console.error(`Error deleting ${itemPath}:`, error);
            throw error; // Re-throw other errors
        }
    }
}

async function ensureDirStructure(): Promise<void> {
    console.log('\nEnsuring directory structure...');
    for (const dir of DIRS_TO_ENSURE) {
        const dirPath = path.resolve(process.cwd(), dir);
        await fs.mkdir(dirPath, { recursive: true });
        // console.log(`Ensured directory exists: ${dirPath}`);
    }

    console.log('Creating .keep files...');
    for (const dir of DIRS_NEEDING_KEEP) {
        const keepFilePath = path.resolve(process.cwd(), dir, '.keep');
        try {
            await fs.writeFile(keepFilePath, '');
            // console.log(`Created .keep file in: ${dir}`);
        } catch (error) {
            console.error(`Failed to create .keep file in ${dir}:`, error);
        }
    }
}

async function resetAiMemory(): Promise<void> {
    console.log('Resetting ai-memory.md...');
    const aiMemoryPath = path.resolve(process.cwd(), 'ai-memory.md');
    try {
        await fs.writeFile(aiMemoryPath, DEFAULT_AI_MEMORY_CONTENT);
        console.log('Reset ai-memory.md to default content.');
    } catch (error) {
        console.error('Failed to reset ai-memory.md:', error);
    }
}

async function resetConfigIntroductionFlag(): Promise<void> {
    console.log('Resetting introductionSubmitted flag in config.ts...');
    const configPath = path.resolve(process.cwd(), 'src/config.ts');
    try {
        let content = await fs.readFile(configPath, 'utf-8');

        // Use a regex to find and replace the introductionSubmitted line,
        // preserving whitespace and comments
        const regex = /(\s*introductionSubmitted\s*:\s*)(?:true|false)(\s*,?.*)/;
        if (regex.test(content)) {
            content = content.replace(regex, '$1false$2');
            await fs.writeFile(configPath, content, 'utf-8');
            console.log('Successfully reset introductionSubmitted to false in config.ts.');
        } else {
            console.warn('Could not find introductionSubmitted flag in config.ts to reset.');
        }
    } catch (error) {
        console.error('Failed to reset introductionSubmitted flag in config.ts:', error);
    }
}

async function main() {
    console.log('\nThis script will reset your TechDeck Academy progress:');
    console.log('- Deleting:');
    ITEMS_TO_DELETE.forEach(item => console.log(`  - ${item}`));
    console.log('- Resetting:');
    console.log('  - ai-memory.md');
    console.log('  - introductionSubmitted flag in config.ts');
    console.log('\nYour config.ts will NOT be modified.');
    console.log('This action involves deleting files and directories!');

    rl.question('\nAre you sure you want to continue? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes') {
            console.log('\nProceeding with reset...');
            try {
                // Delete specified items
                console.log('\nDeleting items...');
                for (const item of ITEMS_TO_DELETE) {
                    const itemPath = path.resolve(process.cwd(), item);
                    await deleteItem(itemPath);
                }

                // Reset ai-memory.md
                await resetAiMemory();

                // Reset introductionSubmitted flag in config.ts
                await resetConfigIntroductionFlag();

                // Ensure directory structure and .keep files
                await ensureDirStructure();

                console.log('\nReset complete.');
                console.log('Deleted items:', ITEMS_TO_DELETE);
                console.log('Reset items: ai-memory.md, introductionSubmitted flag in config.ts');
                console.log('Directory structure and .keep files ensured.');

                console.log('\nPlease commit these changes to finalize the reset (review carefully!):');
                console.log('  git add .');
                console.log('  git commit -m "Reset TechDeck Academy progress"');
                // console.log('  git push'); // Commenting out push for safety
            } catch (error) {
                console.error('\nAn error occurred during the reset process.');
            }
        } else {
            console.log('\nReset cancelled.');
        }
        rl.close();
    });
}

main().catch(err => {
    console.error("Unhandled error:", err);
    rl.close();
    process.exit(1);
}); 