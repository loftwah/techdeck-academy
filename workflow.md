# TechDeck Academy Workflow

This document outlines the typical workflow for a user starting with TechDeck Academy, from initial setup to receiving and submitting challenges.

## 1. Forking and Initial Setup

1.  **Fork:** Fork the `loftwah/techdeck-academy` repository to your own GitHub account. This is crucial because the system relies on GitHub Actions running within *your* repository to manage *your* state.
2.  **Clone:** Clone *your forked repository* to your local machine.
3.  **Install Dependencies:** Run `npm install`.
4.  **Configure Secrets:**
    *   Create a `.env` file locally with `GEMINI_API_KEY` and `RESEND_API_KEY` for local testing/script execution (optional).
    *   **Crucially:** Configure `GEMINI_API_KEY` and `RESEND_API_KEY` as GitHub Secrets in your forked repository's settings (Settings -> Secrets and variables -> Actions -> New repository secret). The GitHub Actions workflows require these secrets.
5.  **Customize `src/config.ts`:**
    *   Set your `userEmail` and `githubUsername`.
    *   Adjust `topics`, `difficulty`, `mentorProfile`, `schedule`, etc., to your preferences.
    *   **Leave `introductionSubmitted: false` (default).** This enables the standard welcome/introduction flow.
6.  **Commit & Push:** Commit your `config.ts` changes and push them to your repository.

## 2. The First Run (`send-challenge.yml`)

*   **Trigger:** This workflow runs automatically based on the `schedule` in `config.ts` or can be triggered manually via the Actions tab (`workflow_dispatch`).
*   **Execution (`src/index.ts -> initialize()`):**
    *   The `initialize()` function is called.
    *   It attempts to read `student-profile.json`. Since this file doesn't exist yet (or has no `lastUpdated`/`completedChallenges`), it determines this is the **first run**.
    *   **Action:** Sends the **Welcome Email** using the details from `config.ts` and the selected mentor profile.
    *   It creates/updates `student-profile.json` with initial data, likely setting a `status` like `'awaiting_introduction'` or similar, and `completedChallenges: 0`.
*   **Challenge Check:**
    *   The workflow checks the condition: `config.introductionSubmitted || studentProfile.status === 'active' || studentProfile.completedChallenges > 0`.
    *   This evaluates to `false` because `introductionSubmitted` is `false` (from config), `status` is not `'active'`, and `completedChallenges` is `0`.
*   **Result:** `generateChallenge()` is **not** called. The workflow finishes. Only the welcome email has been sent.

## 3. Submitting the Introduction Letter

1.  **Create Letter:** Create a markdown file (e.g., `introduction.md`, `my-goals.md`) inside the `letters/to-mentor/` directory.
2.  **Content:** Write about your goals, background, or ask initial questions.
3.  **Commit & Push:** Commit the new file and push it to your repository.

## 4. Processing the Introduction Letter (`respond-to-letters.yml`)

*   **Trigger:** The push to `letters/to-mentor/` triggers this workflow.
*   **Execution (`src/scripts/process-letters.ts`):**
    *   The workflow identifies the new letter file.
    *   It calls the `process-letters.ts` script.
    *   The script reads the current `student-profile.json` (which has `status: 'awaiting_introduction'`).
    *   It calls the AI (`ai.generateLetterResponse`) to generate a response based on your letter, the mentor profile, and AI memory. **Note:** The quality/relevance of this *initial* response may vary (as seen with the premature Terraform request) and might need prompt refinement in `src/utils/ai.ts`.
    *   The AI response is saved to `letters/from-mentor/`.
    *   An email notification containing the response is sent.
    *   The original letter (`introduction.md`) is moved to `archive/letters/to-mentor/`.
    *   **State Change:** Because the script successfully processed the letter *and* it detected `studentProfile.status === 'awaiting_introduction'`, it calls `profileManager.setProfileStatusActive()`.
    *   **Result:** This updates `student-profile.json`, changing the `status` field to `'active'`.
*   **Commit & Push:** The workflow commits the AI response, the updated `student-profile.json`, and archives the original letter.

When I sent the intro back it responded but didn't seem to change anything else? I'm not sure we fixed that. We should probably also update the config file so it knows not to do the intro twice? Are we actually generating and saving the student profile?

Does this record any of the details from the letter in a way that will affect things? It should?

When I got a response back from my intro it had a bunch of stuff in there for me to do. I didn't actually mind this and it was cool because it was like they were giving me stuff to do that wasn't an official challenge. Do we need a separate function for the intro? So we don't have stuff clash? Separation of concerns?

## 5. Subsequent Challenge Generation (`send-challenge.yml`)

*   **Trigger:** Runs on schedule or manually.
*   **Execution (`src/index.ts -> initialize()`):**
    *   `initialize()` runs. It reads the profile, `isFirstRun` is now `false`. No welcome email is sent.
*   **Challenge Check:**
    *   The workflow checks: `config.introductionSubmitted || studentProfile.status === 'active' || studentProfile.completedChallenges > 0`.
    *   This now evaluates to `true` because `studentProfile.status` is `'active'` (updated in step 4).
*   **Result:** `generateChallenge()` **is called**. A new challenge is generated based on your config and AI memory, saved to `challenges/`, emailed to you, and committed to the repo.

## 6. Submitting a Challenge

1.  **Solve:** Solve the challenge presented in the `.json` file located in the `challenges/` directory.
2.  **Create Submission File:** Create a corresponding submission file in the `submissions/` directory. The format will depend on the challenge type (e.g., code file, markdown with answers). **Note:** The exact submission format expected needs clarification or standardization based on challenge type.
3.  **Commit & Push:** Commit your submission file(s) and push.

There should only ever be able to have one challenge going at a time. If I'm busy or lazy it shouldn't build up or punish me.

## 7. Processing a Challenge Submission (`process-submissions.yml`)

*   **Trigger:** The push to `submissions/` triggers this workflow.
*   **Execution (`src/index.ts -> processSubmission()`):**
    *   Identifies the new submission file.
    *   Calls `processSubmission()`.
    *   Reads the original challenge and your submission.
    *   Calls the AI (`ai.generateFeedback`) to generate feedback based on the submission, challenge, mentor profile, and AI memory.
    *   Saves feedback to `feedback/`.
    *   Updates `student-profile.json` (e.g., increments `completedChallenges`, updates `lastUpdated`, potentially adjusts scores/levels based on feedback - implementation details in `profileManager.updateProfileWithFeedback`).
    *   Appends interaction summary to `ai-memory.md`.
    *   Sends a feedback email.
*   **Commit & Push:** The workflow commits the feedback file, the updated profile, updated AI memory, and the original submission.

## Other Workflows

*   **`generate-digests.yml`:** Runs periodically to create progress summaries in `progress/` based on AI memory.
*   **`rotate-files.yml`:** Runs periodically to archive old challenges, submissions, and feedback based on `config.ts` settings.

---

This workflow represents the core loop. Remember that manual triggers (`workflow_dispatch`) can be used to run actions like `send-challenge` or `respond-to-letters` outside their normal schedule. 