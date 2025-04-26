import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

const ITEMS_TO_DELETE = [
    'student-profile.json',
    'ai-memory.md',
    'challenges',
    'submissions',
    'feedback',
    'letters',
    'progress',
    'archive'
];

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

async function main() {
    console.log('\nThis script will delete the following items to reset your TechDeck Academy progress:');
    ITEMS_TO_DELETE.forEach(item => console.log(`- ${item}`));
    console.log('\nYour config.ts will NOT be deleted.');
    console.log('This action cannot be undone!');

    rl.question('\nAre you sure you want to continue? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes') {
            console.log('\nProceeding with deletion...');
            try {
                for (const item of ITEMS_TO_DELETE) {
                    const itemPath = path.resolve(process.cwd(), item);
                    await deleteItem(itemPath);
                }
                console.log('\nReset complete. Deleted items:');
                ITEMS_TO_DELETE.forEach(item => console.log(`- ${item}`));
                console.log('\nPlease commit these changes to finalize the reset:');
                console.log('  git add .');
                console.log('  git commit -m "Reset TechDeck Academy progress"');
                console.log('  git push');
            } catch (error) {
                console.error('\nAn error occurred during the reset process. Some items may not have been deleted.');
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