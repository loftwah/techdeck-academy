import * as fs from 'fs/promises';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../config.js';

// Define character limits for each section (adjust as needed)
const MAX_CHARS_SNAPSHOT = 500;
const MAX_CHARS_RECENT_ACTIVITY = 1500;
const MAX_CHARS_HISTORY = 2000;
// Define the initial definitions section separately
const INITIAL_DEFINITIONS = `
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
`;
const MEMORY_FILE_PATH = path.join(process.cwd(), 'ai-memory.md');

// Initialize Gemini AI (only for summarization in this file)
// Consider refactoring to have a single AI client instance shared across utils
const apiKey = environment.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set for memory manager')
}
const genAI = new GoogleGenerativeAI(apiKey)
const summaryModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
            // Construct default content with definitions
            const defaultContent = `# AI Teacher\'s Notes for [Student Name/ID]
Last Updated: ${new Date().toISOString()}
${INITIAL_DEFINITIONS}
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
    // Match definitions section (optional, might not always be present if manually edited)
    const definitionsMatch = rawContent.match(/## System Definitions\n([\s\S]*?)\n---/);
    // Adjust header match to stop before definitions OR snapshot
    const headerMatch = rawContent.match(/(.*?)(?=\n## (System Definitions|Current Snapshot))/s);
    // Adjust snapshot match to look for definitions/activity after it
    const snapshotMatch = rawContent.match(/## Current Snapshot(?:.*)\n([\s\S]*?)(?=\n## Recent Activity|\n---)/);
    const recentActivityMatch = rawContent.match(/## Recent Activity(?:.*)\n([\s\S]*?)(?=\n---)/);
    const historyMatch = rawContent.match(/## Long-Term History & Patterns(?:.*)\n([\s\S]*)/);

    // Include definitions in the parsed object if needed, or just ignore for reconstruction
    // For now, we primarily care about header, snapshot, recent, history for updates/reconstruction
    return {
        header: headerMatch ? headerMatch[1].trim() : `# AI Teacher\'s Notes for [Student Name/ID]\nLast Updated: ${new Date().toISOString()}`,
        snapshot: snapshotMatch ? snapshotMatch[1].trim() : '',
        recentActivity: recentActivityMatch ? recentActivityMatch[1].trim() : '',
        history: historyMatch ? historyMatch[1].trim() : ''
        // definitions: definitionsMatch ? definitionsMatch[1].trim() : '' // Optionally store definitions if needed later
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
    const updatedHeader = memory.header.replace(/Last Updated: .*/, `Last Updated: ${newTimestamp}`);

    // For now, assume definitions section is static and read from file initially,
    // or reconstruct based on INITIAL_DEFINITIONS if managing it dynamically.
    // Simpler approach: rely on initial file creation and manual edits for definitions.
    // We only reconstruct the parts we modify programmatically.

    return `${updatedHeader}
${INITIAL_DEFINITIONS} 
## Current Snapshot (~${MAX_CHARS_SNAPSHOT} chars)
${memory.snapshot}

## Recent Activity (~${MAX_CHARS_RECENT_ACTIVITY} chars - Rolling Log)
${memory.recentActivity}

---

## Long-Term History & Patterns (~${MAX_CHARS_HISTORY} chars - Summarized)
${memory.history}`;
}

/**
 * Calls the LLM to summarize text, aiming for a target character count.
 * Includes retry logic.
 * @param textToSummarize The text needing summarization.
 * @param targetMaxChars The desired maximum character count for the summary.
 * @returns A summarized string, or the original text if summarization fails.
 */
async function summarizeWithAI(textToSummarize: string, targetMaxChars: number): Promise<string> {
    // Avoid summarizing very short text
    if (textToSummarize.length < targetMaxChars * 1.2) { // Only summarize if significantly over limit
        console.log(`Skipping summarization: Text length (${textToSummarize.length}) is close to target (${targetMaxChars}).`);
        return textToSummarize;
    }

    console.log(`Attempting AI Summarization for text (length: ${textToSummarize.length}) targeting ~${targetMaxChars} chars.`);
    
    // Aim slightly under the target to allow for model variance
    const promptTargetChars = Math.floor(targetMaxChars * 0.9);
    const prompt = `Summarize the following AI teacher's notes about a student's learning progress. Focus on capturing key patterns, significant achievements, persistent challenges, and potential focus areas. Keep the summary concise and ideally under ${promptTargetChars} characters.\n\nNotes:\n--- START NOTES ---\n${textToSummarize}\n--- END NOTES ---\n\nProvide only the summarized text.`;

    const MAX_RETRIES = 2; // Fewer retries for summarization maybe?
    const RETRY_DELAY_MS = 1500;
    let result;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            result = await summaryModel.generateContent(prompt);
            lastError = null;
            break; // Exit loop on success
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`Error calling AI model for summarization (Attempt ${attempt}/${MAX_RETRIES}):`, lastError);
            if (attempt < MAX_RETRIES) {
                console.log(`Retrying summarization in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                console.error("Max retries reached for summarization.");
            }
        }
    }

    if (lastError || !result) {
        console.error(`AI Summarization failed after ${MAX_RETRIES} attempts. Falling back to TRUNCATION.`);
        // Fallback to simple truncation (keep end) if AI fails
        return `[SUMMARIZATION FAILED - TRUNCATED] ... ${textToSummarize.slice(-targetMaxChars * 0.8)}`;
    }

    try {
        const response = result.response;
        const summaryText = response?.text();
        if (typeof summaryText === 'string' && summaryText.trim().length > 0) {
            console.log(`AI Summarization successful. Original length: ${textToSummarize.length}, Summary length: ${summaryText.length}`);
            // Optional: Add check if summaryText actually reduced length significantly
            // Optional: Add check if summary is still over targetMaxChars and truncate *that* if needed
            return summaryText.trim();
        } else {
             throw new Error('AI returned empty or invalid summary text.');
        }
    } catch (error) {
        console.error("Error processing AI summary response:", error);
        console.error("AI Summarization failed. Falling back to TRUNCATION.");
        // Fallback to simple truncation (keep end) if response parsing fails
        return `[SUMMARIZATION FAILED - TRUNCATED] ... ${textToSummarize.slice(-targetMaxChars * 0.8)}`;
    }
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