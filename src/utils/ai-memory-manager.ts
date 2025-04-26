import * as fs from 'fs/promises';
import * as path from 'path';

// Define character limits for each section (adjust as needed)
const MAX_CHARS_SNAPSHOT = 500;
const MAX_CHARS_RECENT_ACTIVITY = 1500;
const MAX_CHARS_HISTORY = 2000;
const MEMORY_FILE_PATH = path.join(process.cwd(), 'ai-memory.md');

/**
 * Represents the structured content of the AI memory file.
 */
interface AIMemory {
    header: string; // Includes title and last updated
    snapshot: string;
    recentActivity: string;
    history: string;
}

/**
 * Reads the entire content of the ai-memory.md file.
 * If the file doesn't exist, it returns a default structure.
 * This addresses the need for a reliable way to access the AI's central memory.
 * @returns The string content of the memory file.
 */
export async function readAIMemoryRaw(): Promise<string> {
    try {
        return await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.warn('ai-memory.md not found, creating a default one.');
            const defaultContent = `# AI Teacher\'s Notes for [Student Name/ID]
Last Updated: ${new Date().toISOString()}

## Current Snapshot (~${MAX_CHARS_SNAPSHOT} chars)
Initial state. Waiting for first interaction.

## Recent Activity (~${MAX_CHARS_RECENT_ACTIVITY} chars - Rolling Log)
*   No activity logged yet.

---

## Long-Term History & Patterns (~${MAX_CHARS_HISTORY} chars - Summarized)
*   No history recorded yet.`;
            await fs.writeFile(MEMORY_FILE_PATH, defaultContent);
            return defaultContent;
        } else {
            console.error('Error reading AI memory file:', error);
            throw error; // Rethrow other errors
        }
    }
}

/**
 * Parses the raw Markdown content into distinct sections.
 * This allows targeted updates to specific parts of the AI's memory.
 * @param rawContent The raw Markdown string from ai-memory.md.
 * @returns An AIMemory object with separated sections.
 */
function parseAIMemory(rawContent: string): AIMemory {
    const snapshotMatch = rawContent.match(/## Current Snapshot(?:.*)\n([\s\S]*?)(?=\n## Recent Activity)/);
    const recentActivityMatch = rawContent.match(/## Recent Activity(?:.*)\n([\s\S]*?)(?=\n---)/);
    const historyMatch = rawContent.match(/## Long-Term History & Patterns(?:.*)\n([\s\S]*)/);
    const headerMatch = rawContent.match(/(.*?)(?=\n## Current Snapshot)/s);

    return {
        header: headerMatch ? headerMatch[1].trim() : `# AI Teacher\'s Notes for [Student Name/ID]\nLast Updated: ${new Date().toISOString()}`,
        snapshot: snapshotMatch ? snapshotMatch[1].trim() : '',
        recentActivity: recentActivityMatch ? recentActivityMatch[1].trim() : '',
        history: historyMatch ? historyMatch[1].trim() : ''
    };
}

/**
 * Reconstructs the Markdown file content from the parsed sections.
 * Includes updating the 'Last Updated' timestamp in the header.
 * @param memory The AIMemory object.
 * @returns The full Markdown string to be written back to the file.
 */
function reconstructAIMemory(memory: AIMemory): string {
    const newTimestamp = new Date().toISOString();
    // Update the timestamp in the header
    const updatedHeader = memory.header.replace(/Last Updated: .*/, `Last Updated: ${newTimestamp}`);

    return `${updatedHeader}

## Current Snapshot (~${MAX_CHARS_SNAPSHOT} chars)
${memory.snapshot}

## Recent Activity (~${MAX_CHARS_RECENT_ACTIVITY} chars - Rolling Log)
${memory.recentActivity}

---

## Long-Term History & Patterns (~${MAX_CHARS_HISTORY} chars - Summarized)
${memory.history}`;
}


/**
 * PLACEHOLDER: Simulates calling an LLM to summarize text.
 * In a real implementation, this would interact with the AI service.
 * This is the core function addressing the CHARACTER LIMITATIONS concern.
 * @param textToSummarize The text needing summarization.
 * @param targetMaxChars The desired maximum character count for the summary.
 * @returns A summarized string (currently just truncates).
 */
async function summarizeWithAI(textToSummarize: string, targetMaxChars: number): Promise<string> {
    console.warn('AI Summarization called (Placeholder - currently truncating)');
    // !!!! IMPORTANT: Replace this with actual LLM call !!!!
    // Example prompt: "Summarize the following teacher's notes about a student's progress,
    // focusing on key patterns and milestones. Keep the summary concise and under
    // ${targetMaxChars * 0.8} characters: \\n\\n${textToSummarize}"
    const summary = textToSummarize.length > targetMaxChars
        ? `[Summarized Content] ... ${textToSummarize.slice(-targetMaxChars * 0.7)}` // Basic truncation
        : textToSummarize;
    return summary.trim();

}

/**
 * Updates a specific section of the ai-memory.md file.
 * Handles adding new entries, potentially triggering summarization if limits are exceeded.
 * This function ensures memory is continuously updated and managed across workflows.
 * It addresses the need for flexible, string-based updates and archive tracking via summarization.
 * @param section The section to update ('snapshot', 'recentActivity', 'history').
 * @param newContent The new string content to add or replace.
 * @param mode 'append' (adds to the end) or 'overwrite' (replaces entirely). Default: 'append'.
 */
export async function updateAIMemory(
    section: keyof Omit<AIMemory, 'header'>,
    newContent: string,
    mode: 'append' | 'overwrite' = 'append'
): Promise<void> {
    const rawContent = await readAIMemoryRaw();
    const memory = parseAIMemory(rawContent);

    let updatedSectionContent: string;

    // --- Update Logic ---
    if (mode === 'overwrite') {
        updatedSectionContent = newContent;
    } else { // append
        updatedSectionContent = memory[section]
            ? `${memory[section]}\\n${newContent}` // Append with newline
            : newContent;
    }

    // --- Character Limit Management & Summarization ---
    let needsSummarization = false;
    let maxChars = 0;
    let contentToPotentiallySummarize = updatedSectionContent;
    let summarizedHistoryContent = memory.history; // Keep track if history needs update

    if (section === 'recentActivity' && updatedSectionContent.length > MAX_CHARS_RECENT_ACTIVITY) {
        console.log(`Recent Activity section (${updatedSectionContent.length} chars) exceeds limit (${MAX_CHARS_RECENT_ACTIVITY}). Summarizing oldest entries.`);
        needsSummarization = true;
        maxChars = MAX_CHARS_RECENT_ACTIVITY;

        // Strategy: Summarize the *entire* recent activity section and prepend it to history
        // Then, start the recent activity section fresh with the *newContent* only.
        // This simulates moving old recent items into long-term summarized history.

        const summaryOfOldActivity = await summarizeWithAI(memory.recentActivity, MAX_CHARS_HISTORY * 0.5); // Summarize old part concisely
        summarizedHistoryContent = `${summaryOfOldActivity}\\n---\\n${memory.history}`; // Prepend summary to history

        // Check if history now needs summarization after adding the summary
        if (summarizedHistoryContent.length > MAX_CHARS_HISTORY) {
             console.log(`History section (${summarizedHistoryContent.length} chars) exceeds limit (${MAX_CHARS_HISTORY}) after adding recent summary. Summarizing history.`);
             summarizedHistoryContent = await summarizeWithAI(summarizedHistoryContent, MAX_CHARS_HISTORY);
        }

        // Reset recent activity to just the new content
        updatedSectionContent = newContent;


    } else if (section === 'history' && updatedSectionContent.length > MAX_CHARS_HISTORY) {
         console.log(`History section (${updatedSectionContent.length} chars) directly exceeds limit (${MAX_CHARS_HISTORY}). Summarizing.`);
         needsSummarization = true;
         maxChars = MAX_CHARS_HISTORY;
         summarizedHistoryContent = await summarizeWithAI(updatedSectionContent, maxChars); // Summarize the updated history directly
         updatedSectionContent = summarizedHistoryContent; // The updated content *is* the summarized content

    } else if (section === 'snapshot' && updatedSectionContent.length > MAX_CHARS_SNAPSHOT) {
        // Snapshots are typically overwritten, but if appending caused overflow, just truncate.
        console.warn(`Snapshot section exceeds limit (${MAX_CHARS_SNAPSHOT}). Truncating.`);
        updatedSectionContent = updatedSectionContent.slice(0, MAX_CHARS_SNAPSHOT);
    }

     // Assign the potentially modified/summarized content back
    memory[section] = updatedSectionContent;
    if (needsSummarization && section === 'recentActivity') {
        memory.history = summarizedHistoryContent; // Update history if recent activity summary was moved
    }


    // --- Write Back ---
    const newRawContent = reconstructAIMemory(memory);
    await fs.writeFile(MEMORY_FILE_PATH, newRawContent);
    console.log(`AI Memory file updated (Section: ${section}, Mode: ${mode}).`);
}

/**
 * Convenience function to read the parsed AI memory.
 * @returns A Promise resolving to the parsed AIMemory object.
 */
export async function readAIMemoryParsed(): Promise<AIMemory> {
    const rawContent = await readAIMemoryRaw();
    return parseAIMemory(rawContent);
}

// Example Usage (can be removed or kept for testing)
/*
async function testMemory() {
    console.log("Initial Memory:");
    console.log(await readAIMemoryRaw());

    await updateAIMemory('recentActivity', `*   [${new Date().toISOString()}] User completed challenge 'Intro to TS'. Score: 85%. Showed good understanding of types but struggled with generics.`);
    await updateAIMemory('recentActivity', `*   [${new Date().toISOString()}] User sent a letter asking about Python decorators.`);

    console.log("\nUpdated Memory:");
    console.log(await readAIMemoryRaw());

    await updateAIMemory('snapshot', `Student is progressing well with TypeScript basics. Seems interested in Python. Current focus: Advanced TS types.`, 'overwrite');

    console.log("\nMemory after Snapshot Update:");
    console.log(await readAIMemoryRaw());

     // Simulate exceeding limits
     console.log("\nSimulating exceeding limits...");
     let longEntry = "*   ".padEnd(MAX_CHARS_RECENT_ACTIVITY + 100, "X");
     await updateAIMemory('recentActivity', longEntry); // This should trigger summarization logic

     console.log("\nMemory after exceeding limits:");
     console.log(await readAIMemoryRaw());
}

// testMemory(); // Uncomment to run test
*/ 