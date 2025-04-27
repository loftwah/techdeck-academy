import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclarationSchema, FunctionCallingMode, GenerateContentResult } from '@google/generative-ai'
import { environment } from '../config.js'
import * as files from './files.js'; // Import file utilities
import { readAIMemoryRaw, updateAIMemory } from './ai-memory-manager.js'; // Import memory reader
import * as profile from './profile-manager.js'; // Import profile manager for loadMentorProfile
import type { 
  Challenge, 
  StudentProfile, // Keep StudentProfile for types that might still use minimal version
  Feedback, 
  Config, 
  Submission, 
  MentorProfile,
  LetterResponse,
  ChallengeType
} from '../types.js'
// Import Zod schemas
import { ChallengeSchema as ZodChallengeSchema, FeedbackSchema as ZodFeedbackSchema, LetterResponseSchema } from '../schemas.js';
import { ZodError } from 'zod'; // Ensure ZodError is imported

// Initialize Gemini AI
const apiKey = environment.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set')
}
const genAI = new GoogleGenerativeAI(apiKey)

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated model name

// --- Retry Logic Utility --- 

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Calls the Google Generative AI model with retry logic and exponential backoff.
 * @param operationName A descriptive name for the AI operation (for logging).
 * @param prompt The prompt string to send to the model.
 * @// TODO: Add optional parameters for generationConfig and safetySettings if needed later
 * @returns The result from the generative AI model.
 * @throws An error if the API call fails after all retry attempts.
 */
async function callGenerativeAIWithRetry(
    operationName: string,
    prompt: string
    // generationConfig?: GenerationConfig, // Example for future expansion
    // safetySettings?: SafetySetting[]      // Example for future expansion
): Promise<GenerateContentResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${MAX_RETRIES} for AI operation: ${operationName}`);
            // TODO: Pass generationConfig and safetySettings if they are added as params
            const result = await model.generateContent(prompt);
            console.log(`AI operation ${operationName} successful on attempt ${attempt}.`);
            return result; // Success, return result
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`AI call attempt ${attempt} failed for ${operationName}: ${lastError.message}`);
            if (attempt < MAX_RETRIES) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                // Add random jitter to delay (e.g., +/- 10%)
                const jitter = delay * 0.1 * (Math.random() * 2 - 1);
                const effectiveDelay = Math.max(0, Math.round(delay + jitter));
                console.log(`Retrying ${operationName} in approximately ${effectiveDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, effectiveDelay));
            } else {
                 console.error(`AI operation ${operationName} failed after ${MAX_RETRIES} attempts.`);
            }
        }
    }

    // If loop completes without returning, all retries failed.
    throw new Error(`AI operation '${operationName}' failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
}

// --- Prompt Building and Parsing Helpers --- 

type PromptSection = { title: string; content: string; markdownFormat?: 'codeblock' | 'blockquote' | 'notes' };

function buildPrompt(
    persona: { name: string; style: string; tone: string } | null, 
    taskDescription: string,
    contextSections: PromptSection[],
    instructions: string[],
    outputFormatDescription: string
): string {
    let prompt = persona 
        ? `You are the ${persona.name} mentor (${persona.style}, ${persona.tone}).\n\n`
        : '';

    prompt += `${taskDescription}\n`;

    if (contextSections.length > 0) {
        prompt += `\n--- CONTEXT ---`;
        for (const section of contextSections) {
            prompt += `\n## ${section.title}\n`;
            if (section.markdownFormat === 'notes') {
                prompt += `--- START ${section.title.toUpperCase()} ---\n${section.content}\n--- END ${section.title.toUpperCase()} ---\n`;
            } else if (section.markdownFormat === 'codeblock') {
                // Determine language hint if possible (simple heuristic)
                const lang = section.title.toLowerCase().includes('submission') ? '' : ''; // Could add more hints
                prompt += `\`\`\`${lang}\n${section.content}\n\`\`\`\n`;
            } else {
                prompt += `${section.content}\n`; // Default: plain text
            }
        }
        prompt += `--- END CONTEXT ---\n`;
    }

    if (instructions.length > 0) {
        prompt += `\n--- INSTRUCTIONS ---`;
        instructions.forEach((inst, index) => {
            prompt += `\n${index + 1}. ${inst}`;
        });
        prompt += `\n--- END INSTRUCTIONS ---\n`;
    }

    prompt += `\n--- OUTPUT FORMAT ---`;
    prompt += `\n${outputFormatDescription}`; // Describe desired format
    prompt += `\n--- END OUTPUT FORMAT ---`;

    return prompt;
}

// Common Markdown Parsing Functions

const extractH1Content = (markdown: string): string | null => {
    const match = markdown.match(/^#\s+(.*)/m);
    return match ? match[1].trim() : null;
};

const extractH2Content = (markdown: string, heading: string): string | null => {
    const regex = new RegExp(`^##\s+${heading}\s*\n([\s\S]*?)(?=\n##|\n*$)`, 'im');
    const match = markdown.match(regex);
    return match ? match[1].trim() : null;
};

const parseList = (content: string | null): string[] => {
    if (!content) return [];
    // Handles unordered lists (*, -, +) and removes leading markers
    return content.split('\n').map(line => line.trim().replace(/^[-*+]\s+/, '')).filter(Boolean);
};
  
const parseCommaSeparated = (content: string | null): string[] => {
    if (!content) return [];
    return content.split(',').map(item => item.trim()).filter(Boolean);
};

// Define the formal schema for the Challenge object
// Keeping the schema definition for potential future use, but won't enforce function call for now
const ChallengeSchema = {
  type: 'object', 
  properties: {
    id: { type: 'string', description: "Unique challenge identifier (e.g., CC-001)" },
    title: { type: 'string', description: "Concise title for the challenge" },
    description: { type: 'string', description: "Detailed description of the challenge/question" },
    requirements: { 
      type: 'array', 
      items: { type: 'string' },
      description: "List of specific requirements (for coding/iac) or context (for questions)",
      nullable: true
    },
    examples: { 
      type: 'array', 
      items: { type: 'string' }, 
      description: "Illustrative examples, code snippets, or multiple-choice options",
      nullable: true
    },
    hints: { 
      type: 'array', 
      items: { type: 'string' },
      description: "Optional hints to guide the student",
      nullable: true 
    },
    difficulty: { type: 'number', description: "Difficulty rating from 1 to 10" },
    topics: { 
      type: 'array', 
      items: { type: 'string' },
      description: "List of relevant technical topics covered"
    },
    createdAt: { type: 'string', format: "date-time", description: "ISO timestamp of creation" }
  },
  required: ['title', 'description', 'difficulty', 'topics'] 
};

// Updated generateChallengePrompt to use buildPrompt helper
export async function generateChallengePrompt(
  config: Config,
  aiMemory: string,
  recentChallenges: Challenge[]
): Promise<string> {
  const allTopics: string[] = Object.keys(config.topics); 
  const availableTypes = config.preferredChallengeTypes && config.preferredChallengeTypes.length > 0 
                         ? config.preferredChallengeTypes 
                         : ['coding'];
  const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)] as ChallengeType;
  console.log(`Selected challenge type: ${selectedType}`);

  const contextSections: PromptSection[] = [
      { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' }, // Include AI memory
      { title: 'Recent Challenge Topics (Avoid direct repeats)', content: recentChallenges.map(c => c.topics).flat().join(', ') || 'No recent challenges' }
  ];

  const instructions = [
      `Generate a ${selectedType} challenge suitable for difficulty level ${config.difficulty}/10.`,
      `Focus on one or more of these topics if appropriate, but prioritize variety based on recent challenges and AI notes: ${allTopics.join(', ')}.`,
      `Tailor the complexity and requirements to the specified difficulty level.`,
      `Include clear requirements, examples (or options for MCQ), and optional hints.`,
      `Ensure the challenge is self-contained and solvable with the provided information.`
  ];

  // Define the expected JSON output structure based on ZodChallengeSchema fields
  const outputFormatDescription = `Format the response as a single JSON object matching this structure: 
{
  "title": "string (Concise title)",
  "description": "string (Detailed description/question)",
  "type": "${selectedType}" | "coding" | "mcq" | "short_answer" | "iac" | "debugging", // Explicitly include selected type
  "requirements": "string[] | null (List of requirements/context)",
  "examples": "Array<{ type: 'text' | 'code', content: string }> | null (List of examples. Use 'text' for descriptive examples, 'code' for code snippets)",
  "hints": "string[] | null (Optional hints)",
  "difficulty": "number (1-10, matching requested difficulty: ${config.difficulty})",
  "topics": "string[] (List of relevant technical topics covered)"
}
Respond ONLY with this JSON object. Do not include any other text or markdown formatting. Ensure keys and values match the types specified (use null for optional missing fields). Each example MUST have a 'type' field set to either 'text' or 'code'.`;

  return buildPrompt(
      null, // No specific persona needed for challenge generation
      `Generate a new technical challenge.`, // Task Description
      contextSections,
      instructions,
      outputFormatDescription
  );
}

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateFeedbackPrompt(
  challenge: Challenge,
  submission: Submission,
  aiMemory: string,
  mentorProfile: MentorProfile
): Promise<string> {
  const contextSections: PromptSection[] = [
      {
        title: 'Challenge Details',
        // Handle potentially undefined requirements
        content: `Title: ${challenge.title}\nRequirements:\n${challenge.requirements?.join('\n') ?? 'N/A'}`
      },
      { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' },
      { title: 'Student Submission', content: submission.content, markdownFormat: 'codeblock' }
  ];

  const instructions = [
    `Adopt your ${mentorProfile.name} persona (${mentorProfile.style}, ${mentorProfile.tone}).`,
    `Analyze the student\'s submission for the given challenge.`,
    `Compare the submission against the challenge description and requirements.`,
    `Identify specific strengths and weaknesses in the student\'s approach, code, or understanding.`,
    `Provide constructive, actionable suggestions for improvement.`,
    `Suggest a logical next step or focus area (Improvement Path).`
  ];

  // Define the expected JSON output structure based on ZodFeedbackSchema fields
  const outputFormatDescription = `Format the response as a single JSON object matching this structure:
{
  "strengths": "string[] (List of specific positive aspects)",
  "weaknesses": "string[] (List of specific areas for improvement)",
  "suggestions": "string[] (Actionable steps the student can take)",
  "improvementPath": "string (A brief suggestion for the student\'s next focus)"
}
Respond ONLY with this JSON object. Do not include any other text or markdown formatting.`;

  return buildPrompt(
    mentorProfile,
    `Provide feedback on a student\'s challenge submission.`, // Task Description
    contextSections,
    instructions,
    outputFormatDescription
  );
}

// Fixed version of the generateChallenge function
export async function generateChallenge(
  config: Config,
  aiMemory: string, 
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, aiMemory, recentChallenges);
  
  console.log('Generating challenge (expecting JSON response)...');

  // Use the retry utility function
  const result = await callGenerativeAIWithRetry('generateChallenge', prompt);

  const responseText = result.response.text();
  console.log('Raw AI Response (Challenge JSON):\n', responseText);

  // --- JSON Parsing --- 
  let challengeJson: any;
  try {
    // Attempt to parse the entire response as JSON
    challengeJson = JSON.parse(responseText);
  } catch (jsonError) {
    console.error('Failed to parse AI response as JSON:', jsonError);
    console.error('Raw response was:', responseText);
    // Attempt to extract JSON from potential markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        try {
            console.log('Attempting to parse JSON from code block...');
            challengeJson = JSON.parse(codeBlockMatch[1]);
        } catch (codeBlockJsonError) {
            console.error('Failed to parse JSON even from code block:', codeBlockJsonError);
            throw new Error('AI response was not valid JSON, even within a code block.');
        }
    } else {
        throw new Error('AI response was not valid JSON and no JSON code block was found.');
    }
  }

  if (challengeJson.examples === null) {
    challengeJson.examples = [];
  }

  const challengeDataWithDefaults = {
    ...challengeJson,
    id: `CC-${Date.now()}`, // Generate ID locally
    createdAt: new Date().toISOString(), // Generate timestamp locally
    // Ensure requirements, examples, hints are arrays or null, default to [] if undefined
    requirements: challengeJson.requirements ?? null,
    examples: challengeJson.examples ?? null,
    hints: challengeJson.hints ?? null,
    // Ensure type is present, default if necessary (though prompt requested it)
    type: challengeJson.type || 'coding', 
    // Ensure difficulty is present, default if necessary (though prompt requested it)
    difficulty: challengeJson.difficulty ?? config.difficulty, 
  };
  
  // Validate the constructed object using Zod schema
  try {
    // Use parse, which throws on error
    const validatedChallenge = ZodChallengeSchema.parse(challengeDataWithDefaults);
    console.log(`Generated and validated challenge: ${validatedChallenge.id}`);
    return validatedChallenge;
  } catch (error) {
    // Add check for ZodError here
    if (error instanceof ZodError) {
      console.error('Generated challenge data failed validation:', error.errors);
      console.error('Data that failed validation:', challengeDataWithDefaults);
    } else if (error instanceof Error) { // Handle other errors
      console.error('An unexpected error occurred during challenge validation:', error.message);
    } else {
      console.error('An unexpected non-error thrown during challenge validation:', error);
    }
    // Throw a specific error regardless of the caught type
    throw new Error('Generated challenge data failed validation. See logs for details.');
  }
}

// Refactored: Uses aiMemory string instead of StudentProfile object
// Refactored: Accepts submissionContent string and challengeId instead of Submission object
export async function generateFeedback(
  challenge: Challenge,
  submissionContent: string, // Changed from submission: Submission
  challengeId: string, // Added challengeId
  aiMemory: string, 
  mentorProfileName: string 
): Promise<Feedback> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName);
  // Adapt generateFeedbackPrompt call if needed (assuming it's updated or can handle content)
  // For now, assume generateFeedbackPrompt is adapted elsewhere or handles content
  // Let's create a minimal submission-like object for the prompt generator for now
  // if generateFeedbackPrompt hasn't been updated yet
  const tempSubmission = {
    challengeId: challengeId,
    content: submissionContent,
    submittedAt: new Date().toISOString(), // Use current time
    // filePath: submissionDirPath? // Could add if needed by prompt
  };
  const prompt = await generateFeedbackPrompt(challenge, tempSubmission, aiMemory, mentorProfile);

  console.log('Generating feedback (expecting JSON response)...');

  // Use the retry utility function
  const result = await callGenerativeAIWithRetry('generateFeedback', prompt);

  const responseText = result.response.text();
  console.log('Raw AI Response (Feedback JSON):\n', responseText);

  // --- JSON Parsing --- 
  let feedbackJson: any;
  try {
    // Attempt to parse the entire response as JSON
    feedbackJson = JSON.parse(responseText);
  } catch (jsonError) {
    console.error('Failed to parse AI response as JSON:', jsonError);
    console.error('Raw response was:', responseText);
    // Attempt to extract JSON from potential markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        try {
            console.log('Attempting to parse JSON from code block...');
            feedbackJson = JSON.parse(codeBlockMatch[1]);
        } catch (codeBlockJsonError) {
            console.error('Failed to parse JSON even from code block:', codeBlockJsonError);
            throw new Error('AI response was not valid JSON, even within a code block.');
        }
    } else {
        throw new Error('AI response was not valid JSON and no JSON code block was found.');
    }
  }

  // Construct the Feedback object using parsed JSON and adding necessary fields
  // IMPORTANT: submissionId in feedback is now generated in the calling function (processSubmission)
  // We receive feedbackJson which should NOT contain submissionId anymore, as the AI doesn't know it.
  const feedbackData = {
    ...feedbackJson,
    // submissionId: challengeId, // DO NOT set submissionId here, it's set by the caller
    createdAt: new Date().toISOString(), // Generate timestamp locally
    // Ensure required fields are present (even if empty arrays/string), default if necessary
    strengths: feedbackJson.strengths ?? [],
    weaknesses: feedbackJson.weaknesses ?? [],
    suggestions: feedbackJson.suggestions ?? [],
    improvementPath: feedbackJson.improvementPath ?? "Review suggestions and try applying them.", // Use default if missing
  };

  // Construct the object to be validated
  const finalFeedbackData = {
      ...feedbackData, // Data from the AI
      createdAt: feedbackData.createdAt || new Date().toISOString(), // Add timestamp if missing
      // CORRECT: Use the original challengeId passed into the function for validation
      submissionId: challengeId 
  };

  // Validate against Zod schema before returning
  try {
    // Use parse, which throws on error
    const validatedFeedback = ZodFeedbackSchema.parse(finalFeedbackData);
    console.log(`Generated and validated feedback content for challenge: ${challengeId}`);
    return validatedFeedback;
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Generated feedback data failed validation:', error.errors);
      console.error('Data that failed validation:', finalFeedbackData);
    } else if (error instanceof Error) {
      console.error('An unexpected error occurred during feedback validation:', error.message);
    } else {
      console.error('An unexpected non-error thrown during feedback validation:', error);
    }
    throw new Error('Generated feedback data failed validation. See logs for details.');
  }
}

// Refactored: Adds studentStatus parameter to adjust prompt for introductions
// Refactored: Includes config details in the prompt
export async function generateLetterResponsePrompt(
  question: string,
  correspondence: string[],
  aiMemory: string,
  mentorProfile: MentorProfile,
  config: Config, // Now used in the prompt
  studentStatus: string // Added parameter
): Promise<string> {
  const configDetails = `Configured Topics & Levels: ${JSON.stringify(config.topics)}\nPreferred Difficulty: ${config.difficulty}/10\nPreferred Challenge Types: ${config.preferredChallengeTypes?.join(', ') || 'Not specified'}\nUser Email: ${config.userEmail}\nGitHub Username: ${config.githubUsername}`;

  const contextSections: PromptSection[] = [
      { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' },
      { title: 'Student Preferences & Configuration', content: configDetails },
      { title: 'Recent Correspondence', content: correspondence.join('\n---\n') || 'None' },
      { title: 'Student\'s Latest Letter', content: question }
  ];

  let instructions: string[] = [];
  if (studentStatus === 'awaiting_introduction') {
    instructions = [
      `Acknowledge this is the student's introduction/first letter.`,
      `Adopt your ${mentorProfile.name} persona (${mentorProfile.style}, ${mentorProfile.tone}) to provide a welcoming but character-appropriate response.`,
      `Briefly acknowledge the student's stated goals or background from their letter.`,
      `**Critically Important:** DO NOT assign technical tasks, request code examples, or give foundational exercises in this initial response. Mention that formal challenges will follow separately based on their configuration.`,
      `Keep the response concise and encouraging in your persona's style.`,
      `Generate insights based *only* on the content of THIS letter (sentiment, mentioned topics, flags like 'introduction').`
    ];
  } else {
    instructions = [
      `Respond to the student's questions or comments in your ${mentorProfile.name} persona (${mentorProfile.style}, ${mentorProfile.tone}).`,
      `Use the AI Teacher's Notes, student configuration, and recent correspondence for context.`,
      `Provide clear answers or guidance.`,
      `Based on the conversation and the AI Teacher Notes, consider if the student might benefit from adjusting their configured difficulty or topic levels in config.ts. If so, gently suggest they review their configuration.`,
      `Generate relevant insights based on the conversation (sentiment, topics, strengths, weaknesses, flags).`
    ];
  }

  const outputFormatDescription = `Format the response as a single JSON object matching the LetterResponse schema: { content: string (your response to the student), insights: { sentiment?: "positive" | "negative" | "neutral", strengths?: string[], weaknesses?: string[], topics?: string[], skillLevelAdjustment?: number, flags?: string[] } }. Respond ONLY with this JSON object. Ensure the sentiment field, if provided, is ONLY one of "positive", "negative", or "neutral".`;

  return buildPrompt(
      mentorProfile,
      `Respond to the student's letter.`, // Task Description
      contextSections,
      instructions,
      outputFormatDescription
  );
}

// Refactored: Adds studentStatus parameter
export async function generateLetterResponse(
  question: string,
  correspondence: string[],
  aiMemory: string, 
  mentorProfileName: string,
  config: Config,
  studentStatus: string
): Promise<LetterResponse> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName);
  const prompt = await generateLetterResponsePrompt(
    question,
    correspondence,
    aiMemory,
    mentorProfile,
    config,
    studentStatus
  );

  console.log('Generating letter response (expecting Markdown response)...');

  // Use the retry utility function
  const result = await callGenerativeAIWithRetry('generateLetterResponse', prompt);

  const responseText = result.response.text();
  console.log('Raw AI Response (Letter):\n', responseText);

  // Parse the response (assuming parseLetterResponse handles the raw text)
  const letterResponse = await parseLetterResponse(responseText);
  return letterResponse;
}

// Ensure parseLetterResponse function definition exists
// MODIFIED: Uses Zod schema for parsing and validation
export async function parseLetterResponse(responseText: string): Promise<LetterResponse> {
  let text = responseText;
  // Extract JSON from markdown code block if present
  const jsonRegex = /```json\n([\s\S]*?)\n```/i;
  const match = text.match(jsonRegex);
  if (match && match[1]) {
    text = match[1];
  }

  try {
    const jsonData = JSON.parse(text);
    // Use Zod schema to parse and validate
    const parsed = LetterResponseSchema.parse(jsonData);
    // Zod handles default for insights if missing/undefined
    return parsed;
  } catch (error) {
    console.error('Error parsing or validating AI letter response:', error);
    console.error('Raw AI response text:', responseText);
    // Throw a more specific error message, including Zod issues if available
    let errorMessage = 'Failed to parse/validate JSON from AI letter response.';
    if (error instanceof ZodError) {
      errorMessage += ` Validation Issues: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
}

// Function to generate a narrative digest summary
export async function generateDigestSummary(
  aiMemory: string,
  digestType: 'weekly' | 'monthly' | 'quarterly'
): Promise<string> {
  const prompt = `Based on the following AI Teacher\'s Notes, please generate a concise narrative summary for a **${digestType}** student progress report. Focus on overall trends, significant achievements, persistent challenges, and potential focus areas for the upcoming period. Keep the tone encouraging but realistic.

--- START AI TEACHER\'S NOTES ---
${aiMemory}
--- END AI TEACHER\'S NOTES ---

Generate only the narrative summary text (markdown format allowed).`;

  console.log(`Generating ${digestType} digest summary from AI memory...`);
  
  // Use the retry utility function
  const result = await callGenerativeAIWithRetry(`generate${digestType}DigestSummary`, prompt);

  const summaryText = result.response.text();
  console.log(`AI ${digestType} digest summary generated successfully.`);
  return summaryText.trim();
}