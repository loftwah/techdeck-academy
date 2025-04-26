# TechDeck Academy Project Structure

## Directory Structure

```
techdeck-academy/
├── .github/
│   └── workflows/
│       ├── send-challenge.yml       # Generate and send challenges
│       ├── process-submissions.yml  # Process user submissions
│       ├── respond-to-letters.yml   # Handle user questions
│       ├── generate-digests.yml     # Generate progress reports
│       └── rotate-files.yml         # Monthly file rotation and archiving
├── config.ts                        # User configuration
├── src/
│   ├── types.ts                     # TypeScript type definitions
│   ├── profiles/                    # Mentor profiles
│   │   ├── linus.ts                 # Linus Torvalds mentor profile
│   │   ├── supportive.ts            # Supportive mentor profile
│   │   └── technical.ts             # Technical mentor profile
│   ├── utils/
│   │   ├── ai.ts                    # AI interaction utilities
│   │   ├── email.ts                 # Email formatting and sending
│   │   ├── files.ts                 # File operations utilities
│   │   ├── summarizer.ts            # Create summaries for AI context
│   │   ├── rotator.ts               # File rotation and archiving
│   │   ├── stats-manager.ts         # Manage stats.json file size
│   │   ├── summary-manager.ts       # Manage summary.json file size
│   │   └── profile-manager.ts       # Manage student profile file size
│   └── scripts/
│       ├── manual-challenge.ts      # Manual challenge generation
│       ├── manual-feedback.ts       # Manual feedback generation
│       ├── manual-letter.ts         # Manual letter processing
│       ├── manual-digest.ts         # Manual digest generation
│       └── monthly-cleanup.ts       # Manual rotation and cleanup
├── challenges/                      # Challenge storage
│   └── summary.json                 # Summary of all challenges (for AI context)
├── submissions/                     # User submissions
├── feedback/                        # Feedback on submissions
├── letters/
│   ├── to-mentor/                   # User questions to mentor
│   ├── from-mentor/                 # Mentor responses
│   └── archive/                     # Archived correspondence
├── archive/
│   ├── challenges/
│   │   ├── 2025-04/                 # Monthly directories for archived challenges
│   │   └── ...
│   ├── submissions/
│   ├── feedback/
│   └── letters/
├── mentors/                         # Mentor profiles and configurations
├── progress/
│   ├── weekly/                      # Weekly summaries
│   ├── monthly/                     # Monthly roll-ups
│   ├── quarterly/                   # Quarterly big-picture analysis
│   ├── cleanup-reports/             # Reports on file rotations
│   ├── stats.json                   # Raw statistics for tracking progress
│   ├── roadmap.md                   # User-controlled roadmap
│   └── suggested-roadmap.md         # AI-suggested roadmap
└── student-profile.json             # AI's notes on the student (shared between actions)
```

## Core Files (Pseudocode)

### 1. Configuration (config.ts)

```
// Define configuration object with TypeScript types
DEFINE config object:
  // Personal information
  userEmail: string
  githubUsername: string

  // Learning preferences
  subjectAreas: array of strings
  topics: map of subject area to array of topic strings
  difficulty: number (1-10)
  sessionLength: number (minutes)

  // Style preferences
  mentorProfile: string (options: "linus", "supportive", "technical")
  emailStyle: string (options: "casual", "formal", "technical")

  // Schedule
  schedule: string (options: "daily", "threePerWeek", "weekly")

  // Archive settings
  archive: {
    enabled: boolean
    challengeRetentionDays: number
    submissionRetentionDays: number
    letterRetentionDays: number
    detailedStatsRetentionDays: number
    compactSummariesAutomatically: boolean
    maxActiveFilesPerType: number
  }

EXPORT config
```

### 2. Type Definitions (src/types.ts)

```
// Define types for configuration
DEFINE type MentorProfile as string union: "linus" | "supportive" | "technical"
DEFINE type EmailStyle as string union: "casual" | "formal" | "technical"
DEFINE type Schedule as string union: "daily" | "threePerWeek" | "weekly"
DEFINE type SubjectArea as string union: "programming" | "devops" | "networking" /* etc */

// Define types for challenges, submissions, feedback, etc.
DEFINE interface Challenge:
  id: string
  title: string
  description: string
  requirements: array of strings
  examples: array of strings
  hints?: array of strings
  difficulty: number
  topics: array of strings
  createdAt: string

DEFINE interface Submission:
  challengeId: string
  content: string
  submittedAt: string
  filePath: string

DEFINE interface Feedback:
  submissionId: string
  strengths: array of strings
  weaknesses: array of strings
  suggestions: array of strings
  score: number (0-100)
  improvementPath: string
  createdAt: string

DEFINE interface StudentProfile:
  strengths: array of strings
  weaknesses: array of strings
  currentSkillLevel: number
  recommendedTopics: array of strings
  completedChallenges: number
  averageScore: number
  topicProgress: map of topic to progress number
  notes: string
  lastUpdated: string

DEFINE interface ArchiveConfig:
  enabled: boolean
  challengeRetentionDays: number
  submissionRetentionDays: number
  letterRetentionDays: number
  detailedStatsRetentionDays: number
  compactSummariesAutomatically: boolean
  maxActiveFilesPerType: number

DEFINE interface Stats:
  meta: {
    lastCompaction: string
    version: number
    retentionPolicy: {
      daily: number
      weekly: number
      monthly: number
    }
  }
  challenges: {
    daily: array of daily challenge stats
    weekly: array of weekly challenge stats
    monthly: array of monthly challenge stats
  }
  submissions: similar structure to challenges
  topics: map of topic to progress stats
  scores: array of score progression stats
  activity: activity pattern stats
}

DEFINE interface Summary:
  meta: {
    lastUpdated: string
    activeCount: number
    archivedCount: number
  }
  activeChallenges: array of active challenge summaries
  archivedChallenges: array of archived challenge summaries (minimal info)
}

// Add more types as needed
```

### 3. Student Profile (student-profile.json)

```json
{
  "strengths": [
    "Strong understanding of TypeScript types",
    "Good code organization"
  ],
  "weaknesses": [
    "Needs improvement on error handling",
    "Could optimize performance better"
  ],
  "currentSkillLevel": 4.5,
  "recommendedTopics": [
    "Advanced error handling in TypeScript",
    "React performance optimization"
  ],
  "completedChallenges": 12,
  "averageScore": 78,
  "topicProgress": {
    "typescript": 0.7,
    "react": 0.4
  },
  "notes": "Student shows strong progress in type systems but needs more practice with practical applications. Consider focusing next challenges on real-world scenarios.",
  "lastUpdated": "2023-05-15T14:30:00Z"
}
```

### 4. Mentor Profiles (mentors/\*.ts)

Example for Linus mentor profile (mentors/linus.ts):

```
EXPORT linusProfile object:
  name: "Linus Torvalds"

  personality: """
  Direct, technically rigorous, and uncompromising. Values efficiency, elegance, and clarity in code.
  Has low tolerance for sloppy work or unclear thinking. Will point out flaws directly and without
  sugar-coating, but feedback is always technically sound and aimed at improvement.
  """

  feedbackStyle: """
  Brutally honest but substantive technical critique. Does not offer unnecessary praise.
  Focuses on:
  - Code quality and structure
  - Performance considerations
  - Naming conventions and clarity
  - Design decisions and architecture
  - Security and edge cases

  May use colorful language when particularly frustrated with poor design choices.
  """

  challengeStyle: """
  Presents technically interesting problems that require careful thought.
  Challenges often focus on system design, performance optimization, or elegant solutions to
  complex problems. Expects clear, efficient, and well-documented solutions.
  """

  responseStyle: """
  Direct and to the point. Doesn't waste time with pleasantries. Answers questions with
  technical precision and depth. May point out flaws in the question if it shows confused thinking.
  Provides thorough technical explanations when the question deserves it.
  """

  exampleFeedback: """
  [Example feedback in Linus style]
  """

  exampleResponse: """
  [Example response to a question in Linus style]
  """
```

## GitHub Action Workflows (Pseudocode)

### 5. Challenge Generation Workflow (.github/workflows/send-challenge.yml)

```yaml
name: Send Challenge

on:
  # Schedule based on user config
  schedule:
    - cron: "0 9 * * *" # Daily at 9AM
    - cron: "0 9 * * 1,3,5" # Mon, Wed, Fri at 9AM
    - cron: "0 9 * * 1" # Weekly on Monday at 9AM

  # Manual trigger
  workflow_dispatch:

jobs:
  generate-challenge:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Check schedule configuration
        run: |
          # PSEUDOCODE:
          # READ config.ts to get schedule preference
          # DETERMINE if challenge should be sent today based on schedule
          # IF not scheduled for today:
          #   ECHO "Not scheduled for today"
          #   EXIT workflow

      - name: Generate challenge
        run: |
          # PSEUDOCODE:
          # READ student-profile.json for context
          # READ config.ts for user preferences
          # READ challenge summary for history context
          # PREPARE prompt for Gemini API
          # CALL Gemini API to generate challenge
          # PARSE response and format as Markdown
          # SAVE to challenges directory with timestamp ID
          # UPDATE challenge summary.json
          # SEND email using Resend API
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}

      - name: Commit changes
        run: |
          git config --local user.email "academy@techdeck.life"
          git config --local user.name "TechDeck Academy Bot"
          git add challenges/ challenge-summary.json
          git commit -m "Generate new challenge"
          git push
```

### 6. Process Submissions Workflow (.github/workflows/process-submissions.yml)

```yaml
name: Process Submissions

on:
  push:
    paths:
      - "submissions/**"

  workflow_dispatch:

jobs:
  process-submission:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2 # To identify new/changed files

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Identify new submissions
        run: |
          # PSEUDOCODE:
          # FIND newly added or modified files in submissions directory
          # STORE list of files to process

      - name: Process submissions
        run: |
          # PSEUDOCODE:
          # FOR each submission file:
          #   EXTRACT challenge ID from filename
          #   FIND corresponding challenge in challenges directory
          #   READ student-profile.json for context
          #   READ mentor profile based on user configuration
          #   PREPARE prompt for Gemini API
          #   CALL Gemini API to generate feedback
          #   PARSE response and format as Markdown
          #   SAVE to feedback directory
          #   EXTRACT score and update student-profile.json
          #   SEND email using Resend API
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}

      - name: Commit changes
        run: |
          git config --local user.email "academy@techdeck.life"
          git config --local user.name "TechDeck Academy Bot"
          git add feedback/ student-profile.json
          git commit -m "Add feedback for submissions"
          git push
```

### 7. Respond to Letters Workflow (.github/workflows/respond-to-letters.yml)

```yaml
name: Respond to Letters

on:
  push:
    paths:
      - "letters/to-mentor/**"

  workflow_dispatch:

jobs:
  respond-to-letter:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2 # To identify new files

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Identify new letters
        run: |
          # PSEUDOCODE:
          # FIND newly added files in letters/to-mentor directory
          # SORT by creation time (oldest first)
          # LIMIT to processable batch if too many

      - name: Process letters
        run: |
          # PSEUDOCODE:
          # FOR each letter file (oldest first):
          #   READ letter content
          #   READ recent correspondence for context
          #   READ student-profile.json for context
          #   READ mentor profile based on user configuration
          #   PREPARE prompt for Gemini API
          #   CALL Gemini API to generate response
          #   PARSE response and format as Markdown
          #   SAVE to letters/from-mentor directory
          #   UPDATE student-profile.json with new insights
          #   SEND email using Resend API
          #   MOVE processed letter to archive directory
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}

      - name: Commit changes
        run: |
          git config --local user.email "academy@techdeck.life"
          git config --local user.name "TechDeck Academy Bot"
          git add letters/ student-profile.json
          git commit -m "Respond to user letters"
          git push
```

### 8. Generate Digests Workflow (.github/workflows/generate-digests.yml)

```yaml
name: Generate Digests

on:
  schedule:
    - cron: "0 9 * * 0" # Weekly on Sunday
    - cron: "0 9 1 * *" # Monthly on the 1st
    - cron: "0 9 1 1,4,7,10 *" # Quarterly

  workflow_dispatch:
    inputs:
      digestType:
        description: "Type of digest to generate"
        required: true
        default: "weekly"
        type: choice
        options:
          - weekly
          - monthly
          - quarterly

jobs:
  generate-digest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Determine digest type
        run: |
          # PSEUDOCODE:
          # IF manual trigger with specified type:
          #   USE specified type
          # ELSE:
          #   DETERMINE type based on current date
          # SET environment variable for digest type

      - name: Generate digest
        run: |
          # PSEUDOCODE:
          # READ student-profile.json for context
          # READ all relevant data for the period:
          #   a. Challenges completed
          #   b. Submission scores
          #   c. Topics covered
          # CALCULATE statistics and identify trends
          # PREPARE prompt for Gemini API
          # CALL Gemini API to generate digest report
          # PARSE response and format as Markdown
          # SAVE to appropriate directory based on digest type
          # UPDATE suggested-roadmap.md
          # SEND email using Resend API
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}

      - name: Commit changes
        run: |
          git config --local user.email "academy@techdeck.life"
          git config --local user.name "TechDeck Academy Bot"
          git add progress/
          git commit -m "Generate ${DIGEST_TYPE} digest"
          git push
```

### 9. File Rotation Workflow (.github/workflows/rotate-files.yml)

```yaml
name: Rotate Files

on:
  schedule:
    - cron: "0 1 1 * *" # 1st day of month at 1:00 AM

  workflow_dispatch:
    inputs:
      forceRotation:
        description: "Force rotation even if not scheduled"
        required: false
        default: false
        type: boolean

jobs:
  rotate-files:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for accurate dating

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Check if rotation needed
        id: check-rotation
        run: |
          # PSEUDOCODE:
          # IF manual trigger with force option:
          #   SET should_rotate=true
          # ELSE:
          #   CHECK if it's the right time for rotation
          #   CHECK if files have grown too large
          #   SET should_rotate based on checks

      - name: Perform file rotation
        if: steps.check-rotation.outputs.should_rotate == 'true'
        run: |
          # PSEUDOCODE:
          # CREATE archive directories if they don't exist
          # MOVE old challenges to archive (older than 30 days)
          # MOVE old submissions to archive
          # MOVE old feedback to archive
          # MOVE old letters to archive
          # COMPACT stats.json through aggregation
          # COMPACT summary.json by removing details of archived items
          # GENERATE rotation report

      - name: Update summary files
        if: steps.check-rotation.outputs.should_rotate == 'true'
        run: |
          # PSEUDOCODE:
          # REGENERATE challenge summary with only active challenges
          # UPDATE student profile to maintain current context
          # ENSURE all necessary references are updated

      - name: Commit changes
        if: steps.check-rotation.outputs.should_rotate == 'true'
        run: |
          git config --local user.email "academy@techdeck.life"
          git config --local user.name "TechDeck Academy Bot"
          git add archive/ challenges/ submissions/ feedback/ letters/ *.json
          git commit -m "Monthly file rotation and archiving"
          git push
```

## Utility Modules (Pseudocode)

### 10. AI Utilities (src/utils/ai.ts)

```
// Import required libraries and types

/*
FUNCTION: generateChallengePrompt
  INPUT:
    - config: User configuration
    - studentProfile: Student profile data
    - recentChallenges: Array of recent challenges
  STEPS:
    - EXTRACT relevant info from config
    - BUILD context including student strengths/weaknesses
    - INCLUDE summary of recent challenges
    - CONSTRUCT prompt for generating appropriately difficult challenge
  RETURN: Formatted prompt string
*/

/*
FUNCTION: generateFeedbackPrompt
  INPUT:
    - challenge: Original challenge
    - submission: User submission
    - studentProfile: Student profile data
    - mentorProfile: Selected mentor profile
  STEPS:
    - EXTRACT challenge requirements
    - INCLUDE submission content
    - ADD student background from profile
    - ADD mentor persona and feedback style
    - SET instructions for scoring and feedback structure
  RETURN: Formatted prompt string
*/

/*
FUNCTION: generateLetterResponsePrompt
  INPUT:
    - question: User question
    - correspondence: Recent letter exchanges
    - studentProfile: Student profile data
    - mentorProfile: Selected mentor profile
  STEPS:
    - INCLUDE the question
    - ADD conversation history for context
    - ADD student background from profile
    - ADD mentor persona and response style
    - SET instructions for response format
  RETURN: Formatted prompt string
*/

/*
FUNCTION: generateDigestPrompt
  INPUT:
    - digestType: weekly/monthly/quarterly
    - periodStats: Statistics for the period
    - studentProfile: Student profile data
  STEPS:
    - DETERMINE appropriate period and format
    - SUMMARIZE period's achievements and challenges
    - INCLUDE relevant statistics and trends
    - SET instructions for digest structure
  RETURN: Formatted prompt string
*/

/*
FUNCTION: callGeminiAPI
  INPUT:
    - prompt: Formatted prompt string
    - model: Gemini model to use (optional)
    - temperature: Creativity setting (optional)
  STEPS:
    - SETUP API connection with GEMINI_API_KEY
    - SEND prompt to API
    - HANDLE errors and retries
    - PROCESS response
  RETURN: Parsed response from Gemini
*/

/*
FUNCTION: parseChallengeResponse
  INPUT:
    - response: Raw API response
  STEPS:
    - EXTRACT challenge content
    - VALIDATE required sections exist
    - FORMAT properly as markdown
    - STRUCTURE as Challenge object
  RETURN: Challenge object
*/

/*
FUNCTION: parseFeedbackResponse
  INPUT:
    - response: Raw API response
  STEPS:
    - EXTRACT feedback content
    - EXTRACT score value
    - IDENTIFY strengths and weaknesses
    - STRUCTURE as Feedback object
  RETURN: Feedback object
*/

// Export all functions
```

### 11. Email Utilities (src/utils/email.ts)

```
// Import required libraries and types

/*
FUNCTION: formatChallengeEmail
  INPUT:
    - challenge: Challenge to send
    - emailStyle: User's preferred style
  STEPS:
    - CREATE subject line based on challenge title
    - SELECT intro based on emailStyle
    - FORMAT challenge content for email
    - ADD instructions for submitting solution
  RETURN: Email object with subject and content
*/

/*
FUNCTION: formatFeedbackEmail
  INPUT:
    - feedback: Feedback to send
    - submission: Original submission
    - challenge: Original challenge
    - emailStyle: User's preferred style
  STEPS:
    - CREATE subject line referencing challenge
    - SELECT intro based on emailStyle
    - FORMAT feedback content for email
    - ADD score and next steps
  RETURN: Email object with subject and content
*/

/*
FUNCTION: formatLetterResponseEmail
  INPUT:
    - response: Mentor response
    - question: Original question
    - emailStyle: User's preferred style
  STEPS:
    - CREATE subject line based on question topic
    - SELECT intro based on emailStyle
    - FORMAT response content for email
    - ADD instructions for follow-up questions
  RETURN: Email object with subject and content
*/

/*
FUNCTION: formatDigestEmail
  INPUT:
    - digest: Digest content
    - digestType: weekly/monthly/quarterly
    - emailStyle: User's preferred style
  STEPS:
    - CREATE subject line based on digest type and period
    - SELECT intro based on emailStyle
    - FORMAT digest content for email
    - ADD summary and next steps
  RETURN: Email object with subject and content
*/

/*
FUNCTION: sendEmail
  INPUT:
    - to: Recipient email
    - subject: Email subject
    - content: Email content
  STEPS:
    - SETUP Resend API with RESEND_API_KEY
    - FORMAT email with proper styling
    - SEND email via API
    - HANDLE errors and retries
  RETURN: Success status and message ID
*/

// Export all functions
```

### 12. File Rotation Utilities (src/utils/rotator.ts)

```
// Import required libraries and types

/*
FUNCTION: shouldRotateFiles
  INPUT:
    - None (uses config for thresholds)
  STEPS:
    - CHECK if rotation is enabled in config
    - CHECK last rotation date from metadata
    - CHECK file sizes of stats.json and summary.json
    - CHECK number of active files
  RETURN: Boolean indicating if rotation should happen
*/

/*
FUNCTION: archiveChallenges
  INPUT:
    - thresholdDays: Days to keep in active directory
  STEPS:
    - IDENTIFY challenges older than threshold
    - CREATE archive directory for current month
    - MOVE old challenges to archive
    - UPDATE summary.json to reflect changes
  RETURN: Number of files archived
*/

/*
FUNCTION: archiveSubmissions
  INPUT:
    - thresholdDays: Days to keep in active directory
  STEPS:
    - IDENTIFY submissions older than threshold
    - CREATE archive directory for current month
    - MOVE old submissions to archive
    - UPDATE relevant tracking files
  RETURN: Number of files archived
*/

/*
FUNCTION: archiveFeedback
  INPUT:
    - thresholdDays: Days to keep in active directory
  STEPS:
    - IDENTIFY feedback older than threshold
    - CREATE archive directory for current month
    - MOVE old feedback to archive
    - MAINTAIN relationship with submissions
  RETURN: Number of files archived
*/

/*
FUNCTION: archiveLetters
  INPUT:
    - thresholdDays: Days to keep in active directory
  STEPS:
    - IDENTIFY letters older than threshold
    - CREATE archive directory for current month
    - MOVE old letters to archive
    - KEEP correspondence pairs together
  RETURN: Number of files archived
*/

/*
FUNCTION: performMonthlyRotation
  INPUT:
    - force: Force rotation regardless of thresholds
  STEPS:
    - CHECK if rotation is needed
    - RUN all archive functions
    - UPDATE summary files
    - GENERATE rotation report
    - UPDATE timestamp of last rotation
  RETURN: Rotation report with statistics
*/

// Export all functions
```

### 13. Stats Management Utilities (src/utils/stats-manager.ts)

```
// Import required libraries and types

/*
FUNCTION: readStats
  INPUT: None
  STEPS:
    - READ stats.json file
    - HANDLE file not found
    - PARSE JSON
    - VALIDATE structure
  RETURN: Stats object
*/

/*
FUNCTION: writeStats
  INPUT:
    - stats: Stats object to write
  STEPS:
    - VALIDATE stats object
    - STRINGIFY as JSON
    - WRITE to file atomically
  RETURN: Success status
*/

/*
FUNCTION: aggregateOldEntries
  INPUT:
    - thresholds: Days for aggregation levels (optional)
  STEPS:
    - READ current stats
    - IDENTIFY daily entries older than 30 days
    - AGGREGATE them into weekly summaries
    - IDENTIFY weekly entries older than 90 days
    - AGGREGATE them into monthly summaries
    - WRITE updated stats
  RETURN: Size reduction in bytes
*/

/*
FUNCTION: pruneDetailedData
  INPUT:
    - thresholdDays: Days to keep detailed data
  STEPS:
    - READ current stats
    - IDENTIFY entries older than threshold
    - REMOVE detailed information while keeping summaries
    - WRITE updated stats
  RETURN: Size reduction in bytes
*/

/*
FUNCTION: addStatsEntry
  INPUT:
    - category: Stats category
    - data: Entry data
  STEPS:
    - READ current stats
    - ADD new entry to appropriate category
    - CHECK if compaction needed
    - WRITE updated stats
  RETURN: Updated stats object
*/

/*
FUNCTION: getStatsSize
  INPUT: None
  STEPS:
    - CHECK file size of stats.json
  RETURN: File size in bytes
*/

/*
FUNCTION: shouldCompactStats
  INPUT: None
  STEPS:
    - CHECK file size against threshold
    - CHECK entry count
    - CHECK time since last compaction
  RETURN: Boolean indicating if compaction needed
*/

// Export all functions
```

### 14. Summary Management Utilities (src/utils/summary-manager.ts)

```
// Import required libraries and types

/*
FUNCTION: readSummary
  INPUT: None
  STEPS:
    - READ summary.json file
    - HANDLE file not found
    - PARSE JSON
    - VALIDATE structure
  RETURN: Summary object
*/

/*
FUNCTION: writeSummary
  INPUT:
    - summary: Summary object to write
  STEPS:
    - VALIDATE summary object
    - STRINGIFY as JSON
    - WRITE to file atomically
  RETURN: Success status
*/

/*
FUNCTION: addChallengeToSummary
  INPUT:
    - challengeId: Challenge ID
    - challengeData: Challenge data
  STEPS:
    - READ current summary
    - CREATE summary entry with essential data
    - ADD to activeChallenges array
    - UPDATE meta information
    - WRITE updated summary
  RETURN: Updated summary object
*/

/*
FUNCTION: moveChallengeToArchived
  INPUT:
    - challengeId: Challenge ID
  STEPS:
    - READ current summary
    - FIND challenge in activeChallenges
    - REMOVE detailed content
    - MOVE to archivedChallenges array
    - UPDATE meta information
    - WRITE updated summary
  RETURN: Updated summary object
*/

/*
FUNCTION: pruneOldSummaryEntries
  INPUT:
    - thresholdDays: Days to keep detailed summaries
  STEPS:
    - READ current summary
    - IDENTIFY archived challenges older than threshold
    - REMOVE all but essential metadata
    - WRITE updated summary
  RETURN: Size reduction in bytes
*/

/*
FUNCTION: getContextForAI
  INPUT:
    - operationType: Type of operation needing context
  STEPS:
    - READ current summary
    - SELECT relevant challenges based on operation
    - FORMAT context appropriately
  RETURN: Context object for AI prompt
*/

// Export all functions
```

### 15. Student Profile Management (src/utils/profile-manager.ts)

```
// Import required libraries and types

/*
FUNCTION: readStudentProfile
  INPUT: None
  STEPS:
    - READ student-profile.json file
    - HANDLE file not found
    - PARSE JSON
    - VALIDATE structure
  RETURN: StudentProfile object
*/

/*
FUNCTION: writeStudentProfile
  INPUT:
    - profile: StudentProfile to write
  STEPS:
    - VALIDATE profile object
    - STRINGIFY as JSON
    - WRITE to file atomically
  RETURN: Success status
*/

/*
FUNCTION: updateStudent
```
