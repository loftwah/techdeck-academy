// src/config.ts
import { z } from "zod";
var envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required")
});
var env = envSchema.parse(process.env);
var config = {
  // Personal information (should be overridden by user)
  userEmail: "dean@deanlofts.xyz",
  githubUsername: "loftwah",
  // Learning preferences
  subjectAreas: ["programming", "devops"],
  topics: {
    programming: ["typescript", "javascript", "python"],
    devops: ["docker", "kubernetes", "ci-cd"],
    networking: ["tcp-ip", "http", "dns"],
    security: ["cryptography", "web-security", "authentication"],
    cloud: ["aws", "azure", "gcp"],
    databases: ["sql", "nosql", "graph-databases"]
  },
  difficulty: 5,
  sessionLength: 60,
  // Style preferences
  mentorProfile: "supportive",
  emailStyle: "casual",
  // Schedule
  schedule: "threePerWeek",
  // Archive settings
  archive: {
    enabled: true,
    challengeRetentionDays: 30,
    submissionRetentionDays: 60,
    letterRetentionDays: 90,
    detailedStatsRetentionDays: 180,
    compactSummariesAutomatically: true,
    maxActiveFilesPerType: 100
  }
};
var environment = {
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  RESEND_API_KEY: env.RESEND_API_KEY
};

// src/utils/ai.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
var genAI = new GoogleGenerativeAI(environment.GEMINI_API_KEY);
var model = genAI.getGenerativeModel({ model: "gemini-pro" });
async function generateChallengePrompt(config2, studentProfile, recentChallenges) {
  const context = {
    studentLevel: studentProfile.currentSkillLevel,
    strengths: studentProfile.strengths,
    weaknesses: studentProfile.weaknesses,
    recentTopics: recentChallenges.map((c) => c.topics).flat(),
    preferredDifficulty: config2.difficulty
  };
  return `Generate a coding challenge for a student with the following context:
Student Level: ${context.studentLevel}/10
Strengths: ${context.strengths.join(", ")}
Weaknesses: ${context.weaknesses.join(", ")}
Recent Topics: ${context.recentTopics.join(", ")}
Preferred Difficulty: ${context.preferredDifficulty}/10

The challenge should:
1. Be appropriately difficult for their level
2. Help address their weaknesses
3. Build upon their strengths
4. Not repeat too similar topics from recent challenges
5. Include clear requirements and examples

Please format the response as a Challenge object with:
- A unique ID
- Clear title and description
- Specific requirements list
- Practical examples
- Optional hints for guidance
- Appropriate difficulty rating
- Relevant topic tags`;
}
async function generateFeedbackPrompt(challenge, submission, studentProfile, mentorProfile) {
  return `Review this code submission with the following context:
Challenge: ${challenge.title}
Requirements: ${challenge.requirements.join("\n")}

Student Context:
- Current Level: ${studentProfile.currentSkillLevel}/10
- Strengths: ${studentProfile.strengths.join(", ")}
- Weaknesses: ${studentProfile.weaknesses.join(", ")}

Submission:
${submission.content}

Please provide feedback as ${mentorProfile} mentor, including:
1. Key strengths of the implementation
2. Areas for improvement
3. Specific suggestions for better approaches
4. A score out of 100
5. Recommended next steps for improvement

Format the response as a Feedback object.`;
}
async function generateChallenge(config2, studentProfile, recentChallenges) {
  const prompt = await generateChallengePrompt(config2, studentProfile, recentChallenges);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  const challenge = JSON.parse(text);
  return challenge;
}
async function generateFeedback(challenge, submission, studentProfile, mentorProfile) {
  const prompt = await generateFeedbackPrompt(challenge, submission, studentProfile, mentorProfile);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  const feedback = JSON.parse(text);
  return feedback;
}

// src/utils/email.ts
import { marked } from "marked";
import { Resend } from "resend";
var resend = new Resend(environment.RESEND_API_KEY);
marked.setOptions({
  breaks: true,
  // Convert line breaks to <br>
  gfm: true
  // Enable GitHub Flavored Markdown
});
var renderer = new marked.Renderer();
var sizes = {
  1: "24px",
  2: "20px",
  3: "18px",
  4: "16px",
  5: "14px",
  6: "12px"
};
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
function getTextFromTokens(tokens) {
  return tokens.map((token) => {
    if ("text" in token) {
      return token.text;
    }
    return "";
  }).join("");
}
var customRenderer = {
  heading({ tokens, depth }) {
    const text = getTextFromTokens(tokens);
    return `<h${depth} style="font-size: ${sizes[depth]}; margin-top: 20px; margin-bottom: 10px; font-weight: 600; color: #2D3748;">${text}</h${depth}>`;
  },
  code({ text, escaped }) {
    const code = escaped ? text : escapeHtml(text);
    return `<pre style="background-color: #F7FAFC; padding: 16px; border-radius: 8px; overflow-x: auto;"><code>${code}</code></pre>`;
  },
  codespan({ text }) {
    return `<code style="background-color: #F7FAFC; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${text}</code>`;
  },
  blockquote({ tokens }) {
    const text = getTextFromTokens(tokens);
    return `<blockquote style="border-left: 4px solid #CBD5E0; margin: 0; padding-left: 16px; color: #4A5568;">${text}</blockquote>`;
  },
  link({ href, title, tokens }) {
    const text = getTextFromTokens(tokens);
    return `<a href="${href}" style="color: #4299E1; text-decoration: none;" ${title ? `title="${title}"` : ""}>${text}</a>`;
  },
  list(token) {
    const items = token.items.map((item) => `<li>${getTextFromTokens(item.tokens)}</li>`).join("");
    return `<${token.ordered ? "ol" : "ul"} style="padding-left: 24px; margin: 16px 0;">${items}</${token.ordered ? "ol" : "ul"}>`;
  }
};
Object.assign(renderer, customRenderer);
marked.use({ renderer });
var baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2D3748; max-width: 800px; margin: 0 auto; padding: 20px;">
  ${content}
  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;">
  <footer style="color: #718096; font-size: 14px;">
    <p>TechDeck Academy - AI-Powered Learning Platform</p>
  </footer>
</body>
</html>
`;
var markdownToHtml = async (markdown) => {
  return await marked.parse(markdown);
};
var getGreeting = (style) => {
  switch (style) {
    case "casual":
      return "Hey there! \u{1F44B}";
    case "formal":
      return "Dear Student,";
    case "technical":
      return "Greetings,";
    default:
      return "Hello,";
  }
};
async function formatChallengeEmail(challenge, emailStyle) {
  const markdown = `
${getGreeting(emailStyle)}

# ${challenge.title}

${challenge.description}

## Requirements
${challenge.requirements.map((req) => `- ${req}`).join("\n")}

## Examples
${challenge.examples.map((ex) => `\`\`\`
${ex}
\`\`\``).join("\n\n")}

${challenge.hints ? `## Hints
${challenge.hints.map((hint) => `- ${hint}`).join("\n")}` : ""}

## Submission Instructions
1. Create your solution
2. Save it in the \`submissions/\` directory with your challenge ID
3. Commit and push your changes

Good luck! \u{1F680}
`;
  return {
    subject: `New Challenge: ${challenge.title}`,
    html: baseTemplate(await markdownToHtml(markdown))
  };
}
async function formatFeedbackEmail(feedback, submission, challenge, emailStyle) {
  const markdown = `
${getGreeting(emailStyle)}

# Feedback for: ${challenge.title}

## Score: ${feedback.score}/100

## Strengths
${feedback.strengths.map((s) => `- ${s}`).join("\n")}

## Areas for Improvement
${feedback.weaknesses.map((w) => `- ${w}`).join("\n")}

## Suggestions
${feedback.suggestions.map((s) => `- ${s}`).join("\n")}

## Next Steps
${feedback.improvementPath}

Keep up the great work! \u{1F4AA}
`;
  return {
    subject: `Feedback: ${challenge.title}`,
    html: baseTemplate(await markdownToHtml(markdown))
  };
}
function validateEmailContent(content) {
  if (!content.subject || typeof content.subject !== "string") {
    throw new Error("Email subject is required and must be a string");
  }
  if (!content.html || typeof content.html !== "string") {
    throw new Error("Email HTML content is required and must be a string");
  }
  if (content.subject.length > 100) {
    throw new Error("Email subject is too long (max 100 characters)");
  }
  if (content.html.length > 1e5) {
    throw new Error("Email HTML content is too long (max 100KB)");
  }
}
async function sendEmail(config2, content) {
  validateEmailContent(content);
  try {
    await resend.emails.send({
      from: "TechDeck Academy <academy@techdeck.life>",
      to: [config2.userEmail],
      subject: content.subject,
      html: content.html
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("rate limit")) {
        throw new Error("Email rate limit exceeded. Please try again later.");
      } else if (error.message.includes("invalid email")) {
        throw new Error(`Invalid email address: ${config2.userEmail}`);
      } else if (error.message.includes("unauthorized")) {
        throw new Error("Invalid API key or authentication failed");
      }
    }
    throw error;
  }
}

// src/utils/files.ts
import { promises as fs } from "fs";
import path from "path";
var PATHS = {
  challenges: "challenges",
  submissions: "submissions",
  feedback: "feedback",
  letters: {
    toMentor: "letters/to-mentor",
    fromMentor: "letters/from-mentor",
    archive: "letters/archive"
  },
  archive: {
    challenges: "archive/challenges",
    submissions: "archive/submissions",
    feedback: "archive/feedback",
    letters: "archive/letters"
  },
  progress: {
    weekly: "progress/weekly",
    monthly: "progress/monthly",
    quarterly: "progress/quarterly",
    cleanupReports: "progress/cleanup-reports"
  }
};
async function ensureDirectories() {
  const allPaths = [
    PATHS.challenges,
    PATHS.submissions,
    PATHS.feedback,
    PATHS.letters.toMentor,
    PATHS.letters.fromMentor,
    PATHS.letters.archive,
    PATHS.archive.challenges,
    PATHS.archive.submissions,
    PATHS.archive.feedback,
    PATHS.archive.letters,
    PATHS.progress.weekly,
    PATHS.progress.monthly,
    PATHS.progress.quarterly,
    PATHS.progress.cleanupReports
  ];
  for (const dir of allPaths) {
    await fs.mkdir(dir, { recursive: true });
  }
}
async function writeChallenge(challenge) {
  const filename = `${challenge.id}.json`;
  const filepath = path.join(PATHS.challenges, filename);
  await fs.writeFile(filepath, JSON.stringify(challenge, null, 2));
}
async function readChallenge(challengeId) {
  const filepath = path.join(PATHS.challenges, `${challengeId}.json`);
  const content = await fs.readFile(filepath, "utf-8");
  return JSON.parse(content);
}
async function listChallenges() {
  const files = await fs.readdir(PATHS.challenges);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
}
async function writeSubmission(submission) {
  const filename = `${submission.challengeId}-${Date.now()}.json`;
  const filepath = path.join(PATHS.submissions, filename);
  await fs.writeFile(filepath, JSON.stringify(submission, null, 2));
}
async function listSubmissions(challengeId) {
  const files = await fs.readdir(PATHS.submissions);
  const submissions = files.filter((f) => f.endsWith(".json"));
  if (challengeId) {
    return submissions.filter((f) => f.startsWith(challengeId));
  }
  return submissions.map((f) => f.replace(".json", ""));
}
async function writeFeedback(feedback) {
  const filename = `${feedback.submissionId}.json`;
  const filepath = path.join(PATHS.feedback, filename);
  await fs.writeFile(filepath, JSON.stringify(feedback, null, 2));
}
async function archiveChallenge(challengeId) {
  const challenge = await readChallenge(challengeId);
  const monthDir = getMonthDir();
  const archivePath = path.join(PATHS.archive.challenges, monthDir);
  await fs.mkdir(archivePath, { recursive: true });
  await fs.rename(
    path.join(PATHS.challenges, `${challengeId}.json`),
    path.join(archivePath, `${challengeId}.json`)
  );
}
async function archiveSubmission(submissionId) {
  const monthDir = getMonthDir();
  const archivePath = path.join(PATHS.archive.submissions, monthDir);
  await fs.mkdir(archivePath, { recursive: true });
  await fs.rename(
    path.join(PATHS.submissions, `${submissionId}.json`),
    path.join(archivePath, `${submissionId}.json`)
  );
}
function getMonthDir() {
  const date = /* @__PURE__ */ new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
async function isFileOlderThan(filepath, days) {
  try {
    const stats = await fs.stat(filepath);
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1e3 * 60 * 60 * 24);
    return ageInDays > days;
  } catch {
    return false;
  }
}

// src/utils/stats-manager.ts
import { promises as fs2 } from "fs";
import path2 from "path";
var STATS_FILE = path2.join("progress", "stats.json");
var DEFAULT_STATS = {
  meta: {
    lastCompaction: (/* @__PURE__ */ new Date()).toISOString(),
    version: 1,
    retentionPolicy: {
      daily: 30,
      weekly: 90,
      monthly: 365
    }
  },
  challenges: {
    daily: [],
    weekly: [],
    monthly: []
  },
  submissions: {
    daily: [],
    weekly: [],
    monthly: []
  },
  topics: {},
  scores: [],
  activity: {
    daysActive: 0,
    streakCurrent: 0,
    streakLongest: 0,
    preferredTimes: []
  }
};
async function readStats() {
  try {
    const content = await fs2.readFile(STATS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return DEFAULT_STATS;
  }
}
async function writeStats(stats) {
  await fs2.mkdir(path2.dirname(STATS_FILE), { recursive: true });
  await fs2.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
}
async function addChallengeStats(challenge) {
  const stats = await readStats();
  const date = (/* @__PURE__ */ new Date()).toISOString();
  stats.challenges.daily.push({
    date,
    count: 1,
    details: {
      challengeId: challenge.id,
      topics: challenge.topics,
      difficulty: challenge.difficulty
    }
  });
  for (const topic of challenge.topics) {
    if (!stats.topics[topic]) {
      stats.topics[topic] = {
        completedChallenges: 0,
        averageScore: 0,
        lastActivity: date
      };
    }
    stats.topics[topic].lastActivity = date;
  }
  await writeStats(stats);
}
async function addSubmissionStats(submission, feedback) {
  const stats = await readStats();
  const date = (/* @__PURE__ */ new Date()).toISOString();
  stats.submissions.daily.push({
    date,
    count: 1,
    details: {
      submissionId: submission.challengeId,
      score: feedback.score
    }
  });
  stats.scores.push({
    date,
    score: feedback.score,
    challengeId: submission.challengeId
  });
  const today = (/* @__PURE__ */ new Date()).toDateString();
  const lastActive = new Date(stats.activity.lastActivity || 0).toDateString();
  if (today !== lastActive) {
    stats.activity.daysActive++;
    if (today === new Date(lastActive).toDateString() + 1) {
      stats.activity.streakCurrent++;
      stats.activity.streakLongest = Math.max(
        stats.activity.streakCurrent,
        stats.activity.streakLongest
      );
    } else {
      stats.activity.streakCurrent = 1;
    }
  }
  const hour = (/* @__PURE__ */ new Date()).getHours();
  stats.activity.preferredTimes.push(`${hour}:00`);
  stats.activity.preferredTimes = stats.activity.preferredTimes.slice(-100);
  await writeStats(stats);
}
async function aggregateOldEntries() {
  const stats = await readStats();
  const now = Date.now();
  const oldDailyChallenges = stats.challenges.daily.filter((entry) => {
    const age = (now - new Date(entry.date).getTime()) / (1e3 * 60 * 60 * 24);
    return age > stats.meta.retentionPolicy.daily;
  });
  if (oldDailyChallenges.length > 0) {
    const weeklyGroups = groupByWeek(oldDailyChallenges);
    stats.challenges.weekly.push(...weeklyGroups);
    stats.challenges.daily = stats.challenges.daily.filter((entry) => {
      const age = (now - new Date(entry.date).getTime()) / (1e3 * 60 * 60 * 24);
      return age <= stats.meta.retentionPolicy.daily;
    });
  }
  stats.meta.lastCompaction = (/* @__PURE__ */ new Date()).toISOString();
  await writeStats(stats);
}
function groupByWeek(dailyStats) {
  const weeks = {};
  for (const stat of dailyStats) {
    const date = new Date(stat.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString();
    if (!weeks[weekKey]) {
      weeks[weekKey] = [];
    }
    weeks[weekKey].push(stat);
  }
  return Object.entries(weeks).map(([weekStart, stats]) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return {
      weekStart,
      weekEnd: weekEnd.toISOString(),
      count: stats.reduce((sum, stat) => sum + stat.count, 0),
      summary: {
        totalEntries: stats.length,
        details: stats.map((s) => s.details)
      }
    };
  });
}
async function shouldCompactStats() {
  try {
    const stats = await fs2.stat(STATS_FILE);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > 5) return true;
    const lastCompaction = (await readStats()).meta.lastCompaction;
    const daysSinceCompaction = (Date.now() - new Date(lastCompaction).getTime()) / (1e3 * 60 * 60 * 24);
    return daysSinceCompaction > 7;
  } catch {
    return false;
  }
}

// src/utils/summary-manager.ts
import { promises as fs3 } from "fs";
import path3 from "path";
var SUMMARY_FILE = path3.join("challenges", "summary.json");
var DEFAULT_SUMMARY = {
  meta: {
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    activeCount: 0,
    archivedCount: 0
  },
  activeChallenges: [],
  archivedChallenges: []
};
async function readSummary() {
  try {
    const content = await fs3.readFile(SUMMARY_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return DEFAULT_SUMMARY;
  }
}
async function writeSummary(summary) {
  await fs3.mkdir(path3.dirname(SUMMARY_FILE), { recursive: true });
  await fs3.writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2));
}
async function addChallengeToSummary(challenge) {
  const summary = await readSummary();
  summary.activeChallenges.push(challenge);
  summary.meta.activeCount++;
  summary.meta.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  await writeSummary(summary);
}
async function moveChallengeToArchived(challengeId, archivedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const summary = await readSummary();
  const challengeIndex = summary.activeChallenges.findIndex((c) => c.id === challengeId);
  if (challengeIndex === -1) {
    throw new Error(`Challenge ${challengeId} not found in active challenges`);
  }
  const challenge = summary.activeChallenges[challengeIndex];
  summary.activeChallenges.splice(challengeIndex, 1);
  summary.meta.activeCount--;
  summary.archivedChallenges.push({
    id: challenge.id,
    title: challenge.title,
    createdAt: challenge.createdAt,
    archivedAt
  });
  summary.meta.archivedCount++;
  summary.meta.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  await writeSummary(summary);
}
async function pruneOldSummaryEntries(thresholdDays) {
  const summary = await readSummary();
  const now = Date.now();
  summary.archivedChallenges = summary.archivedChallenges.filter((challenge) => {
    const age = (now - new Date(challenge.archivedAt).getTime()) / (1e3 * 60 * 60 * 24);
    return age <= thresholdDays;
  });
  summary.meta.archivedCount = summary.archivedChallenges.length;
  summary.meta.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  await writeSummary(summary);
}
async function getContextForAI(operationType) {
  const summary = await readSummary();
  if (operationType === "challenge") {
    return {
      recentChallenges: summary.activeChallenges.slice(-5),
      totalActive: summary.meta.activeCount,
      totalArchived: summary.meta.archivedCount
    };
  } else {
    return {
      activeChallenges: summary.activeChallenges,
      totalChallenges: summary.meta.activeCount + summary.meta.archivedCount
    };
  }
}

// src/utils/profile-manager.ts
import { promises as fs4 } from "fs";
var PROFILE_FILE = "student-profile.json";
var DEFAULT_PROFILE = {
  strengths: [],
  weaknesses: [],
  currentSkillLevel: 1,
  recommendedTopics: [],
  completedChallenges: 0,
  averageScore: 0,
  topicProgress: {},
  notes: "New student profile",
  lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
};
async function readStudentProfile() {
  try {
    const content = await fs4.readFile(PROFILE_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return DEFAULT_PROFILE;
  }
}
async function writeStudentProfile(profile) {
  await fs4.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2));
}
async function updateProfileWithFeedback(challenge, feedback) {
  const profile = await readStudentProfile();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  profile.completedChallenges++;
  const totalScore = profile.averageScore * (profile.completedChallenges - 1) + feedback.score;
  profile.averageScore = totalScore / profile.completedChallenges;
  for (const topic of challenge.topics) {
    if (!profile.topicProgress[topic]) {
      profile.topicProgress[topic] = 0;
    }
    const scoreProgress = feedback.score / 100 * 0.9;
    profile.topicProgress[topic] = Math.min(
      1,
      profile.topicProgress[topic] + 0.1 + scoreProgress
    );
  }
  updateStrengthsAndWeaknesses(profile, feedback);
  updateRecommendedTopics(profile);
  updateSkillLevel(profile);
  profile.lastUpdated = now;
  await writeStudentProfile(profile);
}
function updateStrengthsAndWeaknesses(profile, feedback) {
  const maxItems = 5;
  for (const strength of feedback.strengths) {
    if (!profile.strengths.includes(strength)) {
      profile.strengths.unshift(strength);
      if (profile.strengths.length > maxItems) {
        profile.strengths.pop();
      }
    }
  }
  for (const weakness of feedback.weaknesses) {
    if (!profile.weaknesses.includes(weakness)) {
      profile.weaknesses.unshift(weakness);
      if (profile.weaknesses.length > maxItems) {
        profile.weaknesses.pop();
      }
    }
  }
}
function updateRecommendedTopics(profile) {
  const lowProgressTopics = Object.entries(profile.topicProgress).filter(([_, progress]) => progress < 0.5).map(([topic]) => topic);
  const weaknessTopics = profile.weaknesses.flatMap((weakness) => {
    return Object.keys(profile.topicProgress).filter((topic) => weakness.toLowerCase().includes(topic.toLowerCase()));
  });
  profile.recommendedTopics = [.../* @__PURE__ */ new Set([...weaknessTopics, ...lowProgressTopics])].slice(0, 5);
}
function updateSkillLevel(profile) {
  const factors = {
    averageScore: profile.averageScore / 100 * 0.4,
    // 40% weight
    topicProgress: Object.values(profile.topicProgress).reduce((sum, p) => sum + p, 0) / Math.max(1, Object.keys(profile.topicProgress).length) * 0.3,
    // 30% weight
    completedChallenges: Math.min(1, profile.completedChallenges / 50) * 0.3
    // 30% weight
  };
  const totalProgress = Object.values(factors).reduce((sum, factor) => sum + factor, 0);
  profile.currentSkillLevel = Math.round(totalProgress * 10);
}

// src/index.ts
async function initialize() {
  await ensureDirectories();
  const studentProfile = await readStudentProfile();
  if (await shouldCompactStats()) {
    await aggregateOldEntries();
  }
  console.log("TechDeck Academy initialized successfully");
  return studentProfile;
}
async function generateChallenge2() {
  const studentProfile = await readStudentProfile();
  const context = await getContextForAI("challenge");
  const recentChallenges = context.recentChallenges || [];
  const challenge = await generateChallenge(
    config,
    studentProfile,
    recentChallenges
  );
  await writeChallenge(challenge);
  await addChallengeToSummary(challenge);
  await addChallengeStats(challenge);
  const emailContent = await formatChallengeEmail(
    challenge,
    config.emailStyle
  );
  await sendEmail(config, emailContent);
  console.log(`Challenge "${challenge.title}" generated and sent`);
}
async function processSubmission(submission) {
  const studentProfile = await readStudentProfile();
  const challenge = await readChallenge(submission.challengeId);
  await writeSubmission(submission);
  const feedback = await generateFeedback(
    challenge,
    submission,
    studentProfile,
    config.mentorProfile
  );
  await writeFeedback(feedback);
  await addSubmissionStats(submission, feedback);
  await updateProfileWithFeedback(challenge, feedback);
  const emailContent = await formatFeedbackEmail(
    feedback,
    submission,
    challenge,
    config.emailStyle
  );
  await sendEmail(config, emailContent);
  console.log(`Feedback generated for submission ${submission.challengeId}`);
}
async function archiveOldContent() {
  const { archive } = config;
  const challengeIds = await listChallenges();
  for (const challengeId of challengeIds) {
    const challengePath = `${PATHS.challenges}/${challengeId}.json`;
    if (await isFileOlderThan(challengePath, archive.challengeRetentionDays)) {
      await archiveChallenge(challengeId);
      await moveChallengeToArchived(challengeId);
    }
  }
  const submissionIds = await listSubmissions();
  for (const submissionId of submissionIds) {
    const submissionPath = `${PATHS.submissions}/${submissionId}.json`;
    if (await isFileOlderThan(submissionPath, archive.submissionRetentionDays)) {
      await archiveSubmission(submissionId);
    }
  }
  await pruneOldSummaryEntries(archive.challengeRetentionDays);
  console.log("Archive operation completed");
}
export {
  archiveOldContent,
  generateChallenge2 as generateChallenge,
  initialize,
  processSubmission
};
