# TechDeck Academy

![TechDeck Academy Logo](src/assets/techdeck-academy.jpg)

Welcome to the open-source version of **TechDeck Academy**! This project provides a framework for an AI-powered, personalized learning experience driven by GitHub Actions and powered by Google Gemini. It's designed to help users learn technical subjects through AI-generated challenges, feedback, Q&A, and progress tracking.

## ✨ Key Features

*   **AI-Generated Challenges:** Automatically creates coding or technical challenges tailored to the user's configured skill level, topics, and preferences.
*   **Personalized Feedback:** AI analyzes submissions and provides constructive feedback based on a chosen mentor persona (e.g., technical, supportive).
*   **AI Mentor Q&A:** Users can ask questions and receive answers from their chosen AI mentor persona.
*   **Automated Progress Tracking:** Generates weekly, monthly, and quarterly progress reports (digests).
*   **Configurable Learning:** Users define subject areas, topics, difficulty, mentor style, and communication schedule via `config.ts`.
*   **GitHub-Based Workflow:** Leverages GitHub Actions for automation and Git for storing challenges, submissions, feedback, and progress.
*   **Data Management:** Includes mechanisms for managing and archiving historical data (challenges, submissions, feedback, letters) to keep the repository size manageable.

## ⚙️ How It Works

TechDeck Academy operates primarily through a set of GitHub Actions triggered by schedules or repository events (like pushes):

1.  **Configuration (`config.ts`):** The user defines their learning preferences, schedule, and personal details here.
2.  **Challenge Generation (`send-challenge.yml`):** Based on the schedule in `config.ts`, this action uses Gemini to generate a new challenge relevant to the user's profile (`student-profile.json`) and preferences. The challenge is saved in the `challenges/` directory and emailed to the user via Resend.
3.  **Submission Processing (`process-submissions.yml`):** When a user pushes a solution to the `submissions/` directory, this action triggers. It uses Gemini, considering the chosen mentor profile (`src/profiles/`), to analyze the submission against the original challenge and generate feedback. Feedback is saved in `feedback/`, the student profile is updated, and an email is sent.
4.  **Letter Processing (`respond-to-letters.yml`):** When a user pushes a question (`.md` file) to `letters/to-mentor/`, this action uses Gemini and the selected mentor profile to generate a response. The response is saved in `letters/from-mentor/` and emailed. The original letter is archived.
5.  **Digest Generation (`generate-digests.yml`):** On a schedule (weekly, monthly, quarterly), this action analyzes recent activity (challenges, feedback, scores) and uses Gemini to generate a progress report, saving it in the `progress/` subdirectories.
6.  **File Rotation (`rotate-files.yml`):** Periodically (e.g., monthly), this action archives older files from `challenges/`, `submissions/`, `feedback/`, and `letters/` into the corresponding `archive/` subdirectories. It also compacts summary and statistics files (`stats.json`, `challenges/summary.json`).

## 📂 Project Structure

The project is organized as follows:

```
techdeck-academy/
├── .github/workflows/     # GitHub Actions for automation
├── config.ts              # User configuration (IMPORTANT: Edit this first!)
├── src/                   # Source code (TypeScript)
│   ├── types.ts           # Core type definitions
│   ├── profiles/          # AI mentor personality definitions
│   ├── utils/             # Helper functions (AI, email, files, etc.)
│   └── scripts/           # Manual execution scripts (TBD)
├── challenges/            # Stores generated challenges
├── submissions/           # User pushes solutions here
├── feedback/              # Stores AI-generated feedback
├── letters/               # Stores user questions and mentor responses
│   ├── to-mentor/         # User pushes questions here
│   └── from-mentor/       # AI saves responses here
├── archive/               # Stores old data after rotation
├── progress/              # Stores progress digests and stats
│   ├── stats.json         # Raw statistics
│   ├── roadmap.md         # User-managed learning roadmap
│   └── suggested-roadmap.md # AI-suggested roadmap updates
├── student-profile.json   # AI's persistent notes about the student
├── structure.md           # Detailed documentation of structure and pseudocode
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
    *   Adjust `subjectAreas`, `topics`, `difficulty`, `mentorProfile`, `emailStyle`, and `schedule` according to your preferences.
    *   Review the `archive` settings.
5.  **Initialize Student Profile (Optional):** You can optionally edit `student-profile.json` to give the AI some starting context about your skills, although it will build this over time.
6.  **Initial Commit & Push:** Commit your changes (especially to `config.ts` and potentially `.env` *if* you add it to `.gitignore` - recommended) and push to your repository.
7.  **Enable & Understand GitHub Actions:**
    *   Ensure GitHub Actions are enabled for your repository (usually default).
    *   **Scheduling:** The `schedule` setting in `config.ts` (e.g., `"daily"`, `"threePerWeek"`, `"weekly"`) determines how often actions like challenge generation should logically occur. The corresponding GitHub Action workflow (e.g., `send-challenge.yml`) might run on a fixed schedule (like daily), but it contains internal logic to check your `config.ts` setting and will only proceed with generating/sending if the configured schedule aligns with the current day.
    *   **Manual Triggers:** Most workflows (like `send-challenge.yml`, `generate-digests.yml`) also include a `workflow_dispatch` trigger. This allows you to **manually run the workflow** at any time directly from the "Actions" tab of your repository on GitHub. This is useful for getting your first challenge immediately or generating a report on demand. Simply navigate to the Actions tab, select the workflow, and click "Run workflow".

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs, feature requests, or improvements.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.