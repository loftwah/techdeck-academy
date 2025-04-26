# TechDeck Academy

![TechDeck Academy Logo](src/assets/techdeck-academy.jpg)

Welcome to the open-source version of **TechDeck Academy**! This project provides a framework for an AI-powered, personalized learning experience driven by GitHub Actions and powered by Google Gemini. It's designed to help users learn technical subjects through AI-generated challenges, feedback, Q&A, and progress tracking.

## ✨ Key Features

*   **AI-Generated Challenges:** Automatically creates coding or technical challenges tailored to the user's configured skill level, topics, and preferences, influenced by recent interactions (including letters).
*   **Personalized Feedback:** AI analyzes submissions and provides constructive feedback based on a chosen mentor persona (e.g., technical, supportive).
*   **AI Mentor Q&A:** Users can ask questions via markdown files (`letters/to-mentor/`) and receive answers from their chosen AI mentor persona. The AI analyzes the letter for insights to update the student's profile.
*   **Automated Progress Tracking:** Generates weekly, monthly, and quarterly progress reports (digests).
*   **Configurable Learning:** Users define subject areas, topics, difficulty, mentor style, and communication schedule via `config.ts`.
*   **GitHub-Based Workflow:** Leverages GitHub Actions for automation and Git for storing challenges, submissions, feedback, and progress.
*   **Data Management:** Includes mechanisms for managing and archiving historical data (challenges, submissions, feedback, letters) to keep the repository size manageable.

## ⚙️ How It Works

TechDeck Academy operates primarily through a set of GitHub Actions triggered by schedules or repository events (like pushes):

1.  **Configuration (`config.ts`):** The user defines their learning preferences (topics and desired levels, difficulty, preferred challenge types), schedule, and personal details here.
2.  **Challenge Generation (`send-challenge.yml`):** Based on the schedule in `config.ts`, this action reads the AI's current memory (`ai-memory.md`) and user configuration. It uses Gemini, guided by the memory and preferences, to generate a new challenge relevant to the user's progress, choosing from the user's `preferredChallengeTypes`. The challenge is saved in the `challenges/` directory using a reliable structured output format and emailed to the user via Resend.
3.  **Submission Processing (`process-submissions.yml`):** When a user pushes a solution to the `submissions/` directory, this action triggers. It reads the AI memory, the challenge, and the submission. It uses Gemini, considering the chosen mentor profile (`src/profiles/`), to analyze the submission and generate feedback contextualized by the student's history in `ai-memory.md`. Feedback is saved in `feedback/`, a summary is appended to `ai-memory.md`, core metrics are updated in the minimal `student-profile.json`, and an email is sent.
4.  **Letter Processing (`respond-to-letters.yml`):** When a user pushes a question (`.md` file) to `letters/to-mentor/`, this action triggers. It reads the AI memory, the letter, and the selected mentor profile. It uses Gemini to generate a response, leveraging the student's history from `ai-memory.md`. It also analyzes the user's letter for *new* insights (`LetterInsights`). These insights and a summary of the interaction are appended to `ai-memory.md`, the minimal `student-profile.json` timestamp is updated, the response is saved in `letters/from-mentor/`, emailed, and the original letter is archived.
5.  **Digest Generation (`generate-digests.yml`):** On a schedule (weekly, monthly, quarterly), this action reads the AI memory (`ai-memory.md`) and basic stats. It uses Gemini to generate a *narrative summary* of recent progress based on the AI memory. This summary, along with core statistics, is saved as a report in the `progress/` subdirectories.
6.  **File Rotation (`rotate-files.yml`):** Periodically, this action archives older files from `challenges/`, `submissions/`, and `feedback/` into the corresponding `archive/` subdirectories based on `config.ts` settings. Letter archiving is handled by the letter processing workflow.

## 📂 Project Structure

The project is organized as follows:

```
techdeck-academy/
├── .github/workflows/     # GitHub Actions for automation
│   ├── respond-to-letters.yml # Handles Q&A and profile updates from letters
│   └── ... (other workflows)
├── config.ts              # User configuration (topics, levels, preferences, schedule)
├── ai-memory.md           # AI's persistent narrative notes about the student (updated automatically)
├── student-profile.json   # Minimal student profile (core metrics like count, score, last updated)
├── src/                   # Source code (TypeScript)
│   ├── types.ts           # Core type definitions (Challenge, Feedback, Config, etc.)
│   ├── profiles/          # AI mentor personality definitions (e.g., linus.ts)
│   ├── utils/             # Helper functions (AI, email, files, managers)
│   │   ├── ai.ts          # Gemini interactions & prompt generation
│   │   ├── ai-memory-manager.ts # Manages reading/writing/summarizing ai-memory.md
│   │   ├── profile-manager.ts # Manages minimal student-profile.json & logs events to AI memory
│   │   └── ...
│   └── scripts/           # Scripts executed by workflows (letter processing, reset)
├── challenges/            # Stores generated challenges
├── submissions/           # User pushes solutions here
├── feedback/              # Stores AI-generated feedback
├── letters/               # Stores user questions and mentor responses
│   ├── to-mentor/         # User pushes questions here (e.g., `question-about-loops.md`)
│   └── from-mentor/       # AI saves responses here (e.g., `question-about-loops-response.md`)
├── archive/               # Stores old data after rotation
│   └── letters/           # Archived letters
│       ├── to-mentor/     # Archived original questions
│       └── from-mentor/   # Archived responses (optional, TBD)
├── progress/              # Stores progress digests and stats
│   ├── stats.json         # Raw statistics
│   ├── roadmap.md         # User-managed learning roadmap
│   └── suggested-roadmap.md # AI-suggested roadmap updates
├── README.md              # This file
└── LICENSE                # Project License
```

For a more detailed breakdown, see `structure.md`.

## 🚀 Getting Started

1.  **Fork/Clone:** Fork this repository or clone it to your local machine.
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    *   Create a `.env` file in the root directory.
    *   Add your API keys:
        ```dotenv
        GEMINI_API_KEY=your_google_gemini_api_key
        RESEND_API_KEY=your_resend_api_key
        ```
    *   **Important:** For the GitHub Actions to work, you **must** also configure `GEMINI_API_KEY` and `RESEND_API_KEY` as [GitHub Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) in your repository settings.
4.  **Customize `config.ts`:**
    *   Open `src/config.ts`.
    *   Update `userEmail` and `githubUsername` with your details.
    *   Define your desired learning `topics` and your estimated `currentLevel` (1-10) for each.
    *   Adjust `difficulty`, `preferredChallengeTypes`, `mentorProfile`, `emailStyle`, and `schedule` according to your preferences.
    *   Review the `archive` settings.
    *   **Starting Challenges (Automatic vs Manual):**
        *   **Automatic (Recommended):** Leave `introductionSubmitted: false`. Challenges will automatically start after you submit your *first* letter (e.g., an introduction) to the `letters/to-mentor/` directory and it is successfully processed by the `respond-to-letters.yml` workflow.
        *   **Manual Skip:** If you want to skip writing an introductory letter and start challenges immediately, set `introductionSubmitted: true`.
5.  **Write First Letter (Optional but Recommended):**
    *   Create a markdown file (e.g., `introduction.md`, `my-goals.md`) in the `letters/to-mentor/` directory outlining your background, goals, or any initial questions.
    *   Push this file to your repository.
    *   The `respond-to-letters.yml` workflow will process it: generate an AI response, email it to you, update the AI's memory (`ai-memory.md`), and archive your original letter.
    *   **If this is your first letter and `introductionSubmitted` was `false` in your config, this action will automatically update your profile status, enabling challenges to be sent by the `send-challenge.yml` workflow on its next run.**
6.  **Initial Commit & Push:** Commit your changes (especially to `config.ts` and potentially `.env` *if* you add it to `.gitignore` - recommended) and push to your repository.
7.  **Enable & Understand GitHub Actions:**
    *   Ensure GitHub Actions are enabled for your repository (usually default).
    *   **Challenge Scheduling (`send-challenge.yml`):** This workflow runs on a schedule (or manually). It will only generate a challenge if a) your profile status is 'active' (set automatically after your first letter is processed) OR b) you have manually set `introductionSubmitted: true` in `config.ts`, AND c) the timing aligns with your configured `challengeFrequency`.
    *   **Manual Triggers:** Most workflows (like `send-challenge.yml`, `generate-digests.yml`, `respond-to-letters.yml`) include a `workflow_dispatch` trigger. This allows you to manually run them from the "Actions" tab. This is useful for processing a letter immediately or getting your first challenge sooner after your first letter has been processed (or after setting the config flag).

## 🔄 Resetting Your Progress

If you want to completely reset your TechDeck Academy progress and start over as if it's your first time (triggering the welcome email again), you need to remove the files and directories that store your state and interaction history.

**Manual Reset Steps:**

1.  **Stop any running workflows (optional but recommended):** If you know workflows might be running, you might want to disable them temporarily in the GitHub Actions tab.
2.  **Delete the following files and directories from the root of your repository:**
    *   `student-profile.json` (Stores core metrics)
    *   `ai-memory.md` (Stores AI notes)
    *   `challenges/` (Contains current challenge files)
    *   `submissions/` (Contains your submitted solutions)
    *   `feedback/` (Contains AI feedback files)
    *   `letters/to-mentor/` (Contains your sent letters)
    *   `letters/from-mentor/` (Contains AI responses to letters)
    *   `progress/` (Contains generated digests and potentially stats files)
    *   `archive/` (Contains all archived data - delete this for a *complete* reset)
3.  **Commit and Push:** Commit these deletions to your repository.

**Alternative: Reset Script**

You can also use the provided npm script to perform the deletions automatically:

```bash
npm run reset
```
This script will:
1.  Ask for confirmation before proceeding.
2.  Delete the same files and directories listed in Manual Step 2.
3.  Print a reminder of the deleted items.

**Important:** After running the reset script, you **still need to manually commit and push** the changes to finalize the reset. Resetting will clear your profile status, meaning you will need to submit a new first letter (or set the `introductionSubmitted` flag) to start challenges again.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs, feature requests, or improvements.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.