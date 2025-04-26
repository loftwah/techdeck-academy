# TechDeck Academy Workflow

This document outlines the typical workflow for a user starting with TechDeck Academy, from initial setup to receiving and submitting challenges, reflecting the latest design principles.

## 1. Forking and Initial Setup

1.  **Fork:** Fork the `loftwah/techdeck-academy` repository to your own GitHub account. This is crucial because the system relies on GitHub Actions running within *your* repository to manage *your* state.
2.  **Clone:** Clone *your forked repository* to your local machine.
3.  **Install Dependencies:** Run `npm install`.
4.  **Configure Secrets:**
    *   Create a `.env` file locally with `GEMINI_API_KEY` and `RESEND_API_KEY` for local testing/script execution (optional but recommended).
    *   **Crucially:** Configure `GEMINI_API_KEY` and `RESEND_API_KEY` as GitHub Secrets in your forked repository's settings (Settings -> Secrets and variables -> Actions -> New repository secret). The GitHub Actions workflows require these secrets.
5.  **Customize `config.ts`:**
    *   Set your `userEmail` and `githubUsername`. These will be used to initialize your `student-profile.json`.
    *   Set your desired `topics` and `currentLevel` for each. This is the source of truth for your topic preferences and initial levels.
    *   Set your base `difficulty` (1-10). This is the source of truth for overall challenge difficulty.
    *   Configure `mentorProfile`, `preferredChallengeTypes`, `schedule`, `emailStyle`, `archive`, etc.
    *   **`introductionSubmitted` flag:**
        *   Leave `false` (default) to follow the standard flow (Step 2a/3/4). Challenges start *after* your first letter is processed.
        *   Set `true` to skip the introduction letter requirement. Challenges can start immediately (Step 2b).
6.  **Commit & Push:** Commit your `config.ts` changes and push them to your repository.

## 2. Profile Initialization (`send-challenge.yml` on first run OR first letter push)

*   **Trigger:** The first time *any* workflow runs that needs the student profile (e.g., `send-challenge.yml` on schedule, `respond-to-letters.yml` on first push to `letters/to-mentor/`).
*   **Execution (`src/utils/profile-manager.ts -> loadOrCreateAndSyncProfile()`):**
    1.  The function attempts to read `student-profile.json`.
    2.  **File Not Found (First Run):**
        *   It logs a warning and creates a new `studentProfile` object **in memory**.
        *   It populates the object using `config.ts`:
            *   `userId` and `name` from `config.githubUsername`.
            *   `currentSkillLevel` from `config.difficulty`.
            *   `topicLevels` structure copied from `config.topics`.
            *   `completedChallenges` set to `0`.
            *   **`status` is set based on `config.introductionSubmitted`:**
                *   If `config.introductionSubmitted` is `false`, `status` is set to `'awaiting_introduction'`.
                *   If `config.introductionSubmitted` is `true`, `status` is set to `'active'`.
            *   `lastUpdated` is set to the current timestamp.
        *   It calls `writeStudentProfile()` to save this new profile to `student-profile.json`.
    3.  **File Found (Subsequent Runs):**
        *   It reads the existing profile.
        *   It **syncs** specific fields with the current `config.ts`: `userId`, `name`, and adds/removes topics in `topicLevels` to match `config.topics`.
        *   **Crucially, it does NOT sync `status` or `currentSkillLevel` from `config.ts` after initial creation.** `status` is managed by the letter processing flow, and `currentSkillLevel` reflects the initial config difficulty (AI provides context via memory).
        *   If any sync changes were made, it updates `lastUpdated` and calls `writeStudentProfile()` to save.
    4.  **Returns:** The function returns the final, up-to-date `studentProfile` object.

## 3. Initial Workflow Branching (Based on Initial Profile Status)

The workflow that triggered the profile creation/loading continues:

### 3a. If `studentProfile.status` is `'awaiting_introduction'` (Default Flow):

*   **`send-challenge.yml` execution:**
    *   The condition `config.introductionSubmitted || studentProfile.status === 'active' || studentProfile.completedChallenges > 0` evaluates to `false`.
    *   `generateChallenge()` is **not** called.
    *   The `initialize` function in `src/index.ts` proceeds to send the **Welcome Email**.
    *   The system now waits for the user to submit their first letter (Step 4).

### 3b. If `studentProfile.status` is `'active'` (`introductionSubmitted: true` in config):

*   **`send-challenge.yml` execution:**
    *   The condition `config.introductionSubmitted || studentProfile.status === 'active' || studentProfile.completedChallenges > 0` evaluates to `true`.
    *   `generateChallenge()` **is called** (See Step 6 for details).
    *   No Welcome Email is sent.

## 4. Submitting the Introduction Letter (Only if status was `'awaiting_introduction'`)

1.  **Create Letter:** Create a markdown file (e.g., `introduction.md`) inside `letters/to-mentor/`.
2.  **Content:** Write about goals, background, etc.
3.  **Commit & Push:** Commit and push the file.

## 5. Processing the Introduction Letter (`respond-to-letters.yml`)

*   **Trigger:** Push to `letters/to-mentor/`.
*   **Execution (`src/scripts/process-letters.ts`):**
    *   Identifies the new letter file.
    *   Loads the profile using `loadOrCreateAndSyncProfile()` (which confirms `status` is `'awaiting_introduction'`).
    *   Calls `ai.generateLetterResponse()`. The prompt generation (`generateLetterResponsePrompt`) specifically uses the `studentStatus` (`'awaiting_introduction'`) to instruct the AI:
        *   To provide a welcoming response.
        *   **Crucially, NOT to assign tasks or challenges.**
        *   To generate insights based *only* on this letter.
        *   To potentially suggest config changes if the user's intro implies a mismatch (e.g., mentions advanced topics but `config.difficulty` is low).
    *   Saves the AI's JSON response (`LetterResponse` format, containing `content` and `insights`) to `letters/from-mentor/`.
    *   Sends an email notification containing the response `content`.
    *   Archives the original letter file.
    *   Processes the `insights` from the AI response:
        *   Logs the insights (sentiment, topics mentioned, flags, suggested skill adjustment etc.) to `ai-memory.md` using `profileManager.updateProfileFromLetterInsights()`.
        *   **Does NOT automatically update `currentSkillLevel` or `topicLevels` in `student-profile.json`.**
    *   **State Change:** Because the letter was processed successfully for a profile with `status: 'awaiting_introduction'`, the script calls `profileManager.setProfileStatusActive()`.
    *   **Result:** `setProfileStatusActive()` updates `student-profile.json`, changing `status` to `'active'` and updating `lastUpdated`. It also logs the status change event to `ai-memory.md`.
*   **Commit & Push:** Workflow commits the AI response file, the updated `student-profile.json`, and archives the original letter.

## 6. Subsequent Challenge Generation (`send-challenge.yml`)

*   **Trigger:** Runs on schedule or manually.
*   **Execution:**
    *   `initialize()` calls `loadOrCreateAndSyncProfile()` which returns the profile (now with `status: 'active'`).
    *   The condition `config.introductionSubmitted || studentProfile.status === 'active' || studentProfile.completedChallenges > 0` now evaluates to `true`.
    *   The workflow calls `generateChallenge()` in `src/index.ts`.
*   **Internal `generateChallenge()` Process (`src/utils/ai.ts`):**
    1.  **Check Existing:** Checks if any `.json` files exist in `challenges/`. If yes, logs a message and **skips generation** (ensuring only one active challenge).
    2.  **Generate Prompt (`generateChallengePrompt`):**
        *   Gathers context: `ai-memory.md`, `config.ts` (including `difficulty` and `topics`), recent challenge history.
        *   Determines `selectedType` locally based on `config.preferredChallengeTypes`.
        *   Constructs a prompt asking the AI to generate content for a challenge of `selectedType`.
        *   Specifies **Markdown output format** with headings for `Title`, `Description`, `Topics`, `Requirements` (Optional), `Examples` (Optional), `Hints` (Optional).
        *   **Does NOT ask for `id`, `type`, `difficulty`, `createdAt`.**
    3.  **AI Generates Content:** AI returns a single Markdown string.
    4.  **Parse AI Response:**
        *   Uses local parsing logic (`extractContent`, `parseList`) to extract text under the expected headings (`## Title`, etc.) into `parsedData`.
    5.  **Augment & Assign:**
        *   Generates a unique `id` locally.
        *   Adds current `createdAt` timestamp locally.
        *   Assigns `selectedType` (from step 2) to `type` field locally.
        *   Assigns `config.difficulty` to `difficulty` field locally.
        *   Combines local fields and `parsedData` into `challengeData`.
    6.  **Validate:** Validates `challengeData` against `ZodChallengeSchema` (now includes `type`).
    7.  **Return:** Returns the validated `Challenge` object.
*   **Saving & Notifying (`src/index.ts`):**
    *   Saves the returned `Challenge` object as a `.json` file in `challenges/`.
    *   Updates summary/stats.
    *   Formats and sends the challenge email.
    *   Commits the new challenge file.

## 7. Submitting a Challenge

1.  **Solve:** Solve the challenge described in the `.json` file in `challenges/`.
2.  **Create Submission File:** Create your solution file(s) in the `submissions/` directory.
3.  **Commit & Push:** Commit and push your submission.

## 8. Processing a Challenge Submission (`process-submissions.yml`)

*   **Trigger:** Push to `submissions/`.
*   **Execution (`src/index.ts -> processSubmission()`):**
    1.  Identifies the new submission file.
    2.  Reads the corresponding challenge `.json` file from `challenges/`.
    3.  Reads the `ai-memory.md`.
    4.  Saves the submission content (details TBD, likely as a file).
    5.  Calls `ai.generateFeedback()`.
*   **Internal `generateFeedback()` Process (`src/utils/ai.ts`):**
    1.  **Generate Prompt (`generateFeedbackPrompt`):**
        *   Gathers context: challenge details (title, requirements), submission content, `ai-memory.md`, mentor profile.
        *   Constructs a prompt asking the AI to provide qualitative feedback.
        *   Includes instruction to **provide a numerical score (0-100) and justification *within the response text***.
        *   Includes instruction to suggest reviewing config difficulty/topics if appropriate.
        *   Specifies **Markdown output format** with headings for `Strengths`, `Weaknesses`, `Suggestions`, `Improvement Path`.
        *   **Does NOT ask for `submissionId` or `createdAt`.**
    2.  **AI Generates Content:** AI returns a single Markdown string containing the feedback, including the score/justification naturally within the text.
    3.  **Parse AI Response:**
        *   Uses local parsing logic (`extractContent`, `parseList`) to extract text ONLY under the specified headings (`## Strengths`, etc.) into `parsedFeedback`. **Ignores any score text.**
    4.  **Construct Object:**
        *   Creates the final `Feedback` object.
        *   Assigns `submissionId` (from the input submission) locally.
        *   Assigns current `createdAt` timestamp locally.
        *   Includes the parsed `strengths`, `weaknesses`, `suggestions`, `improvementPath`.
        *   **The `Feedback` object has NO `score` field.**
    5.  **Return:** Returns the `Feedback` object.
*   **Saving & Notifying (`src/index.ts`):**
    *   Saves the returned `Feedback` object as a `.json` file in `feedback/`.
    *   Updates stats.
    *   Calls `profileManager.updateProfileWithFeedback()`:
        *   Increments `completedChallenges` in `student-profile.json`.
        *   Updates `lastUpdated` in `student-profile.json`.
        *   **Does NOT calculate or save any `averageScore`.**
        *   Logs a qualitative summary of the feedback (including strengths/weaknesses/suggestions) to `ai-memory.md`.
    *   Formats and sends the feedback email (containing the AI's full Markdown response).
    *   Commits feedback file, updated profile, updated AI memory.

## 9. Other Workflows

*   **`generate-digests.yml`:** Runs periodically. Reads `ai-memory.md`. Calls `ai.generateDigestSummary()` which currently prompts the AI to summarize the *entire* memory file for the requested period (weekly/monthly/quarterly). Saves the narrative summary to `progress/`. **(Note: Does not currently implement tiered daily->weekly->monthly summarization).**
*   **`rotate-files.yml`:** Runs periodically. Calls `archiveOldContent()` which archives challenges, submissions, and feedback older than `config.archive.maxAgeDays`.

---

This workflow represents the core loop. Manual triggers (`workflow_dispatch`) can be used for most actions. Remember `config.ts` is your control panel, and `ai-memory.md` reflects the AI's understanding of your progress. 