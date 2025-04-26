import { z } from 'zod';

// Base schema for ISO date strings
const isoDateTimeString = z.string().datetime({ message: "Invalid ISO 8601 date-time string" });

// Schema for ChallengeType
export const ChallengeTypeSchema = z.enum([
    'coding', 
    'iac', 
    'question', 
    'mcq', 
    'design', 
    'casestudy', 
    'project'
]);

// Schema for Challenge
export const ChallengeSchema = z.object({
    id: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format (e.g., CC-001)" }),
    title: z.string().min(1, { message: "Title is required" }),
    description: z.string().min(1, { message: "Description is required" }),
    type: z.string(),
    requirements: z.array(z.string()).optional().default([]), // Optional array, defaults to empty
    examples: z.array(z.string()).optional().default([]),
    hints: z.array(z.string()).optional().default([]),
    difficulty: z.number().min(1).max(10), // Number between 1 and 10
    topics: z.array(z.string()).min(1, { message: "At least one topic is required" }),
    createdAt: isoDateTimeString
});

// Schema for Submission
export const SubmissionSchema = z.object({
    // studentId: z.string().min(1, { message: "Student ID is required" }), // Removed studentId
    challengeId: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format" }),
    content: z.string().min(1, { message: "Submission content cannot be empty" }),
    submittedAt: isoDateTimeString,
    filePath: z.string().optional()
});

// Schema for Feedback
export const FeedbackSchema = z.object({
    // studentId: z.string().min(1, { message: "Student ID is required" }), // Removed studentId
    // challengeId: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format" }), // Removed challengeId
    submissionId: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format for submissionId" }), // Reverted to submissionId
    strengths: z.array(z.string()).optional().default([]),
    weaknesses: z.array(z.string()).optional().default([]),
    suggestions: z.array(z.string()).optional().default([]),
    improvementPath: z.string().optional().default("Review suggestions and try applying them."),
    createdAt: isoDateTimeString
});

// Updated Schema for TopicLevel structure used in Profile and Config
export const TopicLevelSchema = z.object({
    currentLevel: z.number().min(0).max(10)
});

// Schema for StudentProfileStatus
export const StudentProfileStatusSchema = z.enum([
    'awaiting_introduction', 
    'active', 
    'paused' // Add other potential statuses
]);

// Updated Schema for StudentProfile to match the type definition
export const StudentProfileSchema = z.object({
    userId: z.string().min(1),
    name: z.string(), // Added name field
    status: StudentProfileStatusSchema,
    currentSkillLevel: z.number().min(0).max(10),
    lastUpdated: isoDateTimeString,
    currentChallengeId: z.string().optional(), // Added optional field
    completedChallenges: z.number().min(0).default(0),
    // Use the TopicLevelSchema for the record value
    topicLevels: z.record(z.string(), TopicLevelSchema).optional().default({}), 
    // Removed studentId as it's not in the type
    // studentId: z.string().uuid(), 
});

// Schema for LetterInsights
export const LetterInsightsSchema = z.object({
    strengths: z.array(z.string()).optional(),
    weaknesses: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    sentiment: z.string().optional(),
    skillLevelAdjustment: z.number().optional(),
    flags: z.array(z.string()).optional()
});

// Schema for LetterResponse
export const LetterResponseSchema = z.object({
    content: z.string().min(1, { message: "Letter response content cannot be empty" }),
    // Ensure insights matches the schema, but allow it to be missing or empty {} 
    // Use .default({}) to handle cases where AI might omit the insights key entirely
    insights: LetterInsightsSchema.optional().default({})
});

// --- Stats Schemas ---

// Reusable schema for ISO date strings (if not already defined globally)
// const isoDateTimeString = z.string().datetime({ message: "Invalid ISO 8601 date-time string" });

const DailyStatsSchema = z.object({
    date: isoDateTimeString,
    count: z.number().int().min(0),
    details: z.record(z.unknown()) // Allow any structure for details
});

const WeeklyStatsSchema = z.object({
    weekStart: isoDateTimeString,
    weekEnd: isoDateTimeString,
    count: z.number().int().min(0),
    summary: z.record(z.unknown()) // Allow any structure for summary
});

const MonthlyStatsSchema = z.object({
    month: z.string(), // Could add regex if format is fixed, e.g., YYYY-MM
    count: z.number().int().min(0),
    summary: z.record(z.unknown()) // Allow any structure for summary
});

const TopicProgressSchema = z.object({
    completedChallenges: z.number().int().min(0),
    lastActivity: isoDateTimeString
});

const ActivityPatternSchema = z.object({
    daysActive: z.number().int().min(0),
    streakCurrent: z.number().int().min(0),
    streakLongest: z.number().int().min(0),
    preferredTimes: z.array(z.string()), // Assuming times are strings like "HH:MM"
    lastActivity: isoDateTimeString.optional()
});

export const StatsSchema = z.object({
    meta: z.object({
        lastCompaction: isoDateTimeString,
        version: z.number().int().positive(),
        retentionPolicy: z.object({
            daily: z.number().int().min(0),
            weekly: z.number().int().min(0),
            monthly: z.number().int().min(0)
        })
    }),
    challenges: z.object({
        daily: z.array(DailyStatsSchema),
        weekly: z.array(WeeklyStatsSchema),
        monthly: z.array(MonthlyStatsSchema)
    }),
    submissions: z.object({
        daily: z.array(DailyStatsSchema),
        weekly: z.array(WeeklyStatsSchema),
        monthly: z.array(MonthlyStatsSchema)
    }),
    topics: z.record(TopicProgressSchema), // Record<string, TopicProgress>
    activity: ActivityPatternSchema
});

// --- Summary Schemas ---

// Re-use ChallengeSchema if it's imported or define it if needed
// Assuming ChallengeSchema is available from earlier in the file

const ArchivedChallengeSchema = z.object({
    id: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format" }),
    title: z.string().min(1),
    createdAt: isoDateTimeString,
    archivedAt: isoDateTimeString
});

export const SummarySchema = z.object({
    meta: z.object({
        lastUpdated: isoDateTimeString,
        activeCount: z.number().int().min(0),
        archivedCount: z.number().int().min(0)
    }),
    activeChallenges: z.array(ChallengeSchema), // Use existing ChallengeSchema
    archivedChallenges: z.array(ArchivedChallengeSchema)
});

// You can also infer TypeScript types from schemas if needed:
// export type Challenge = z.infer<typeof ChallengeSchema>;
// export type Submission = z.infer<typeof SubmissionSchema>;
// etc. 