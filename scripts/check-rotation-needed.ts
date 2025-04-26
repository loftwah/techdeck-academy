import { shouldCompactStats } from '../src/utils/stats-manager.js'; // Adjust path as needed

/**
 * Determines if file rotation/compaction is needed based on:
 * 1. Force rotation via GITHUB_EVENT_INPUT_FORCE_ROTATION environment variable.
 * 2. Scheduled rotation on the 1st of the month.
 * 3. Stats file needing compaction (size or age).
 * 
 * Outputs "true" or "false" to stdout.
 */
async function checkRotation() {
    try {
        // 1. Check for forced rotation (e.g., from workflow_dispatch)
        // GitHub Actions sets inputs as environment variables: INPUT_<UPPERCASE_NAME>
        if (process.env.INPUT_FORCEROTATION === 'true') {
            console.log('true'); // Forced rotation
            process.exit(0);
        }

        // 2. Check if it's the 1st of the month (for scheduled runs)
        const today = new Date();
        if (today.getDate() === 1) {
            console.log('true'); // It's the 1st of the month
            process.exit(0);
        }

        // 3. Check if stats file needs compaction
        const needsCompaction = await shouldCompactStats();
        if (needsCompaction) {
            console.log('true'); // Stats need compaction
            process.exit(0);
        }

        // If none of the above conditions met
        console.log('false');
        process.exit(0);

    } catch (error) {
        console.error('Error checking rotation status:', error);
        console.log('false'); // Default to false on error to be safe
        process.exit(1); // Exit with error code
    }
}

// Run the check
checkRotation(); 