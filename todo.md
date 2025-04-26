# TechDeck Academy - TODO & Verification

This document tracks recent issues and items needing verification or further investigation.

## Recent Issue: Challenge Generation Failure

*   **Problem:** The application was crashing during challenge generation (`send-challenge.yml` workflow).
    *   The AI response, while containing the challenge content, was sometimes wrapped in Markdown code fences (```json ... ```), causing direct `JSON.parse` to fail.
    *   Even when the JSON was extracted, it failed Zod schema validation because it lacked the `id` and `createdAt` fields, which are required by the `ChallengeSchema`.
*   **Root Cause:** The validation (`ZodChallengeSchema.parse()`) was happening *before* the application code added the locally generated `id` and `createdAt` fields.
*   **Fix Applied:** Modified `src/utils/ai.ts` (`generateChallenge` function) to:
    1.  Parse the JSON from the AI response (handling potential markdown wrappers).
    2.  Programmatically generate and add the `id` and `createdAt` fields to the parsed object.
    3.  *Then*, validate the complete object using `ZodChallengeSchema.parse()`.

## Clarification: Data Flow for AI Challenge Generation (JSON Context)

Let's trace the data flow involving JSON specifically during challenge generation, referencing `workflow.md`:

1.  **Input (Application -> AI):** (`src/utils/ai.ts -> generateChallengePrompt`)
    *   The application gathers student preferences (`config.ts`), AI memory (`ai-memory.md`), recent challenge history, etc.
    *   It constructs a detailed **text prompt** asking the AI to generate the *content* of a new challenge (title, description, topics, difficulty, requirements, etc.).
    *   Crucially, the prompt *requests* the AI to format this generated content as a **JSON string**. This prompt is sent to the AI.

2.  **Processing (AI):**
    *   The AI processes the text prompt and generates the requested challenge *content* fields.
    *   It *attempts* to format this output as a JSON string as requested.

3.  **Output (AI -> Application):** (`src/utils/ai.ts -> generateChallenge`)
    *   The AI returns a **single string** response to the application.
    *   *Ideally*, this string is the correctly formatted JSON containing the challenge content.
    *   *Sometimes*, the AI might wrap this JSON string in Markdown fences (e.g., ```json\n{...}\n```) or make minor syntax errors.

4.  **Processing (Application):** (`src/utils/ai.ts -> generateChallenge` - **Post-Fix Logic**)
    *   The application receives the AI's raw **string** response.
    *   It first checks for and removes Markdown fences if present.
    *   It uses `JSON.parse()` to convert the (cleaned) JSON **string** into a JavaScript object (`parsedData`) containing the *content* fields provided by the AI.
    *   **Crucially:** It *then* takes this `parsedData` object and **programmatically adds/overwrites** the deterministic fields: generates a unique `id`, adds the current `createdAt` timestamp, ensures optional arrays exist.
    *   Finally, it validates this *complete* object (AI content + local fields) against the `ZodChallengeSchema`.

5.  **Output (Application Storage & Use):** (End of `generateChallenge` & `workflow.md` Step 5)
    *   The validated, complete challenge object (now containing both AI-generated content and locally generated metadata like `id`/`createdAt`) is saved as a `.json` file (e.g., `challenges/CC-001.json`).
    *   This `.json` file **is the structured data the application needs and uses** later in the workflow:
        *   To display the challenge clearly (e.g., in emails).
        *   By the `process-submissions.yml` workflow (Step 7) to read the challenge `requirements` when generating feedback.

**Summary:** Asking the AI for JSON is a strategy to get the *challenge content* back in a structured format that's *easier to parse* reliably with `JSON.parse()` than free-form Markdown. The application takes this parsed content, adds its own controlled data (`id`, `createdAt`), validates everything, and saves the final, complete structure as the `.json` file it needs for subsequent operations. The JSON from the AI is just a transport format for the content part; the application controls the final structure and deterministic values. This approach avoids building a complex, potentially brittle Markdown parser within our application code.

## REVISED & FINAL: Data Flow & Field Responsibility (Markdown Context)

**Goal:** Eliminate AI JSON responses entirely. The AI provides creative text content (formatted via Markdown headings), and the application handles structure, metadata, and validation.

**Field Responsibilities:**

*   **Generated/Controlled Locally (Application Code):**
    *   `id`: Generated uniquely (e.g., `CC-001`) by the application.
    *   `createdAt`: Timestamp added by the application.
    *   `type`: Determined by the application based on `config.ts` before calling the AI (e.g., randomly selecting from `preferredChallengeTypes`).
    *   `difficulty`: Set by the application based on `config.ts`.
    *   **CRITICAL:** The application **MUST NOT** ask the AI for these fields or attempt to parse them from the AI response.

*   **Generated by AI (Creative Content) & Parsed Locally (Application Code):**
    *   `title`: Extracted from under the `## Title` heading in the AI's Markdown response.
    *   `description`: Extracted from under the `## Description` heading.
    *   `topics`: Extracted as a comma-separated list from under the `## Topics` heading. (Needed for accurate memory/tracking).
    *   `requirements`: Extracted as a bulleted list from under the `## Requirements` heading (if present).
    *   `examples`: Extracted as a bulleted list from under the `## Examples` heading (if present).
    *   `hints`: Extracted as a bulleted list from under the `## Hints` heading (if present).
    *   **CRITICAL:** The application prompt **MUST** request these fields using specific Markdown headings, and the application **MUST** parse the AI's response string to extract them.

**Workflow:**

1.  **Select Type/Difficulty (App):** Determine `selectedType` and `difficulty` from `config.ts`.
2.  **Generate Prompt (App):** Construct a prompt (`generateChallengePrompt`):
    *   Provides context (AI memory, config, recent challenges).
    *   Asks AI to generate content for a challenge of `selectedType`.
    *   Specifies the **Markdown output format**, requesting headings ONLY for `Title`, `Description`, `Topics`, `Requirements` (Optional), `Examples` (Optional), `Hints` (Optional).
    *   **Does NOT ask for `id`, `type`, `difficulty`, `createdAt`.**
3.  **AI Generates Content (AI):** AI returns a single Markdown string with the requested content under the specified headings.
4.  **Parse AI Response (App):** The `generateChallenge` function receives the Markdown string.
    *   It uses parsing logic (e.g., `extractContent`, `parseList`) to extract the text under the expected headings (`## Title`, `## Description`, `## Topics`, etc.) into a temporary object (`parsedData`).
5.  **Augment & Assign (App):**
    *   The application generates a unique `id` and the current `createdAt` timestamp.
    *   It assigns the `selectedType` (from Step 1) to the `type` field.
    *   It assigns the `difficulty` (from `config.ts`) to the `difficulty` field.
    *   It combines these local fields with the `parsedData` into the `challengeData` object.
6.  **Validate (App):** The complete `challengeData` object is validated against the `ZodChallengeSchema` (which includes checks for `id`, `title`, `description`, `type`, `difficulty`, `topics`, `createdAt`, etc.).
7.  **Save & Use (App):** The validated challenge object is saved as a `.json` file (e.g., `challenges/CC-001.json`) and used for email notifications and subsequent processing (like feedback generation).

**Summary:** This approach leverages the AI for creative text generation while maintaining local control over critical metadata and structure, preventing the failures associated with AI-generated JSON.

## Next Steps & Verification

1.  **Verify Challenge Generation:** Trigger the `send-challenge.yml` workflow (manually or wait for schedule) and confirm that:
    *   The workflow completes without crashing.
    *   A new challenge JSON file appears in the `challenges/` directory.
    *   The generated challenge file contains a valid `id` (e.g., `CC-001`) and `createdAt` timestamp.

2.  **Investigate Introduction Workflow State (`respond-to-letters.yml`):** Based on previous discussion, we need to confirm the state changes correctly after submitting the introduction letter:
    *   **Confirm `student-profile.json` exists:** Check if this file is present in the root.
    *   **Confirm Status Update:** After the `respond-to-letters.yml` workflow runs for the *introduction* letter, check the `status` field within `student-profile.json`. Did it correctly change from `'awaiting_introduction'` (or similar initial state) to `'active'`?
    *   **Confirm AI Memory Update:** Check `ai-memory.md`. Does it contain a summary or insights derived from the introduction letter after the workflow ran?

3.  **Review Submission Logic (`process-submissions.yml`):**
    *   Ensure the workflow correctly identifies the corresponding challenge for a submission.
    *   Verify that `student-profile.json` is updated appropriately after feedback (e.g., `completedChallenges` incremented, `lastUpdated` timestamp changed).

4.  **Refine Prompts (Ongoing):**
    *   If the AI provides suboptimal responses (e.g., assigning tasks during the intro despite instructions not to), review and refine the corresponding prompt generation logic in `src/utils/ai.ts` (e.g., `generateLetterResponsePrompt`). 