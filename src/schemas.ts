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
    type: ChallengeTypeSchema,
    requirements: z.array(z.string()).optional().default([]), // Optional array, defaults to empty
    examples: z.array(z.string()).optional().default([]),
    hints: z.array(z.string()).optional().default([]),
    difficulty: z.number().min(1).max(10), // Number between 1 and 10
    topics: z.array(z.string()).min(1, { message: "At least one topic is required" }),
    createdAt: isoDateTimeString
});

// Schema for Submission
export const SubmissionSchema = z.object({
    challengeId: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format" }),
    content: z.string().min(1, { message: "Submission content cannot be empty" }),
    submittedAt: isoDateTimeString,
    filePath: z.string().optional()
});

// Schema for Feedback
export const FeedbackSchema = z.object({
    submissionId: z.string().regex(/^CC-\d{3,}$/, { message: "Invalid Challenge ID format for submissionId" }),
    strengths: z.array(z.string()).optional().default([]),
    weaknesses: z.array(z.string()).optional().default([]),
    suggestions: z.array(z.string()).optional().default([]),
    score: z.number().min(0).max(100), // Score between 0 and 100
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
    averageScore: z.number().min(0).max(100),
    lastUpdated: isoDateTimeString,
    currentChallengeId: z.string().optional(), // Added optional field
    completedChallenges: z.number().min(0).default(0),
    // Use the TopicLevelSchema for the record value
    topicLevels: z.record(z.string(), TopicLevelSchema).optional().default({}), 
    // Removed studentId as it's not in the type
    // studentId: z.string().uuid(), 
});

// You can also infer TypeScript types from schemas if needed:
// export type Challenge = z.infer<typeof ChallengeSchema>;
// export type Submission = z.infer<typeof SubmissionSchema>;
// etc. 