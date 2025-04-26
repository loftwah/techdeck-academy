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
import { ChallengeSchema as ZodChallengeSchema, FeedbackSchema as ZodFeedbackSchema } from '../schemas.js';
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
    { 
        title: 'Student Preferences & Configuration', 
        content: `Configured Topics & Levels: ${JSON.stringify(config.topics)}
All Available Topics: ${allTopics.join(', ')}
Preferred Difficulty: ${config.difficulty}/10
Recent Challenge Topics (Avoid direct repeats): ${recentChallenges.map(c => c.topics).flat().join(', ') || 'No recent challenges'}
Preferred Challenge Types: ${availableTypes.join(', ')}`
    },
    { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' }
  ];

  const instructions = [
    `Base the challenge on the student's progress documented in the Teacher's Notes and their preferences, considering the configured topics and their levels.`, // General instruction first
    `Generate a challenge of type: **${selectedType}**.`,
    `Ensure difficulty aligns with student notes and preferred difficulty (${config.difficulty}/10).`,
    `Ensure the selected Topics are relevant and logically connected. For higher difficulty levels, aim for challenges that integrate multiple concepts or require more in-depth solutions.`,
    `Address weaknesses and build on strengths identified in the AI Teacher Notes.`,
    `Avoid directly repeating recent challenge topics.`,
  ];

  // Add type-specific reminders to instructions
  switch (selectedType) {
    case 'coding': instructions.push(`Reminder for 'coding': Focus on problem statement, requirements, examples.`); break;
    case 'iac': instructions.push(`Reminder for 'iac': Focus on task description, resources, example outputs.`); break;
    case 'question': instructions.push(`Reminder for 'question': Focus on clear question in description; requirements/examples likely empty.`); break;
    case 'mcq': instructions.push(`Reminder for 'mcq': Question in description, options using standard Markdown list format under an '## Options' heading.`); break;
    case 'design': instructions.push(`Reminder for 'design': Scenario in description, constraints/focus in requirements.`); break;
    case 'casestudy': instructions.push(`Reminder for 'casestudy': Case study in description, questions in requirements.`); break;
    case 'project': instructions.push(`Reminder for 'project': Project outline in description, steps in requirements.`); break;
    default: instructions.push(`Reminder for default: Generate a standard coding challenge.`);
  }

  // REVISED: Request specific H1/H2, flexible Markdown for optional sections.
  const outputFormatDescription = `Respond using Markdown. Use the following structure EXACTLY:
# [Challenge Title Here]
(The H1 heading above IS the title)

## Description
[Detailed Challenge Description Here]

## Topics
[Comma-separated List of Relevant Topics Here]

(Optional Sections Below - Include ONLY if meaningful and relevant to the challenge type)
## Requirements 
[Use standard Markdown lists (* or -) or paragraphs]

## Examples 
[Use standard Markdown lists (* or -) or paragraphs. For MCQ type, use this section OR ## Options for the choices.]

## Hints 
[Use standard Markdown lists (* or -) or paragraphs]

Use standard Markdown for all content (paragraphs, lists, code blocks etc.). 
ONLY include the optional sections (Requirements, Examples, Hints) if they add value.`;

  return buildPrompt(
      null, // No specific mentor persona for challenge generation
      `Generate a ${selectedType} challenge.`, // Task Description
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
      `Review the student submission based on the challenge details and the student's history in the AI Teacher Notes.`,
      `Provide key strengths of the implementation in relation to the student's progress.`,
      `Identify areas for improvement, considering patterns noted in the memory.`,
      `Give specific suggestions for better approaches or refinements.`,
      `Provide a numerical score out of 100 and justify it within your response text.`,
      `Recommend concrete next steps for improvement, relevant to the student's history.`,
      `Based on the AI Teacher Notes and this submission, consider if the student might benefit from adjusting their configured difficulty or topic levels in config.ts. If so, gently suggest they review their configuration.`
  ];

  // REVISED: Request Markdown output ONLY for qualitative feedback fields.
  const outputFormatDescription = `Respond using Markdown. Use the following headings EXACTLY, including the double hash marks and the field name, followed by the content on the next line(s). Use bullet points for lists under headings. Include your score justification naturally within the text under the appropriate headings.
## Strengths
+- [Strength 1]
+- ...
## Weaknesses
+- [Weakness 1]
+- ...
## Suggestions
+- [Suggestion 1]
+- ...
## Improvement Path
+[Recommended next steps or focus areas]
DO NOT include headings or fields for 'submissionId' or 'createdAt'. These are handled by the application.`;

  return buildPrompt(
      mentorProfile, // Pass the mentor persona
      `Provide feedback on a student submission.`, // Task Description
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
  
  console.log('Generating challenge (expecting Markdown response)...');

  // Use the retry utility function
  const result = await callGenerativeAIWithRetry('generateChallenge', prompt);

  const responseText = result.response.text();
  console.log('Raw AI Response (Challenge):\n', responseText);

  // --- Markdown Parsing --- 
  // Remove duplicate definitions of parsing helpers
  // const extractH1Content = ... (removed)
  // const extractH2Content = ... (removed)
  // const parseList = ... (removed)
  // const parseCommaSeparated = ... (removed)

  // Extract data from Markdown using common helpers
  const title = extractH1Content(responseText);
  const description = extractH2Content(responseText, 'Description');
  const topicsRaw = extractH2Content(responseText, 'Topics');
  const requirementsRaw = extractH2Content(responseText, 'Requirements');
  const examplesRaw = extractH2Content(responseText, 'Examples');
  const hintsRaw = extractH2Content(responseText, 'Hints');
  const optionsRaw = extractH2Content(responseText, 'Options'); // For MCQ

  // Basic validation: Title and Description are essential
  if (!title || !description || !topicsRaw) {
    console.error('Failed to parse essential fields (Title, Description, Topics) from AI response:', responseText);
    throw new Error('Failed to parse essential challenge fields from AI response.');
  }

  // Construct the Challenge object
  const challengeData: Partial<Challenge> = {
    id: `CC-${Date.now()}`, // Simple ID generation
    title: title,
    description: description,
    topics: parseCommaSeparated(topicsRaw),
    requirements: parseList(requirementsRaw),
    // Combine Examples and Options parsing, preferring Options if present (for MCQ)
    examples: parseList(optionsRaw || examplesRaw),
    hints: parseList(hintsRaw),
    difficulty: config.difficulty, // Use requested difficulty
    createdAt: new Date().toISOString(),
    type: 'coding' // Placeholder - TODO: Determine type based on prompt/response?
  };
  
  // Determine type based on prompt or content - IMPROVED HEURISTIC
  const selectedTypeMatch = prompt.match(/Generate a (\w+) challenge/i);
  const inferredType = selectedTypeMatch ? selectedTypeMatch[1].toLowerCase() as ChallengeType : 'coding';
  challengeData.type = inferredType;
  console.log(`Inferred challenge type: ${inferredType}`);

  // Validate the constructed object using Zod schema
  try {
    const validatedChallenge = ZodChallengeSchema.parse(challengeData);
    console.log(`Generated and validated challenge: ${validatedChallenge.id}`);
    return validatedChallenge;
  } catch (error) {
    // Add check for ZodError here
    if (error instanceof ZodError) {
      console.error('Generated challenge data failed validation:', error.errors);
      console.error('Data that failed validation:', challengeData);
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
export async function generateFeedback(
  challenge: Challenge,
  submission: Submission,
  aiMemory: string, 
  mentorProfileName: string 
): Promise<Feedback> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName);
  const prompt = await generateFeedbackPrompt(challenge, submission, aiMemory, mentorProfile);

  console.log('Generating feedback (expecting Markdown response)...');

  // Use the retry utility function
  const result = await callGenerativeAIWithRetry('generateFeedback', prompt);

  const responseText = result.response.text();
  console.log('Raw AI Response (Feedback):\n', responseText);

  // --- Markdown Parsing --- 
  // Remove duplicate definitions of parsing helpers
  // const extractContent = ... (removed - now use extractH2Content)
  // const parseList = ... (removed)

  // Extract data from Markdown using common helpers
  const strengthsRaw = extractH2Content(responseText, 'Strengths');
  const weaknessesRaw = extractH2Content(responseText, 'Weaknesses');
  const suggestionsRaw = extractH2Content(responseText, 'Suggestions');
  const improvementPathRaw = extractH2Content(responseText, 'Improvement Path');

  // Construct the Feedback object
  const feedbackData: Partial<Feedback> = {
    // submissionId is derived from the input submission object or context
    // We need the original submissionId (challengeId-timestamp) 
    // This function currently lacks access to it. 
    // TODO: Pass submissionId to generateFeedback or retrieve it differently.
    submissionId: `${submission.challengeId}-placeholder`, // TEMPORARY PLACEHOLDER
    strengths: parseList(strengthsRaw),
    weaknesses: parseList(weaknessesRaw),
    suggestions: parseList(suggestionsRaw),
    improvementPath: improvementPathRaw ?? "Review suggestions and try applying them.", // Use default if missing
    createdAt: new Date().toISOString(),
  };

  // Validate the constructed object using Zod schema
  try {
    const validatedFeedback = ZodFeedbackSchema.parse(feedbackData);
    console.log(`Generated and validated feedback for submission: ${validatedFeedback.submissionId}`);
    return validatedFeedback;
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Generated feedback data failed validation:', error.errors);
      console.error('Data that failed validation:', feedbackData);
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

  const outputFormatDescription = `Format the response as a single JSON object matching the LetterResponse schema: { content: string (your response to the student), insights: { sentiment?: string, strengths?: string[], weaknesses?: string[], topics?: string[], skillLevelAdjustment?: number, flags?: string[] } }. Respond ONLY with this JSON object.`;

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
// MODIFIED: Throws error on failure instead of returning fallback object
export async function parseLetterResponse(responseText: string): Promise<LetterResponse> {
  let text = responseText;
  // Extract JSON from markdown code block if present
  const jsonRegex = /```json\n([\s\S]*?)\n```/i;
  const match = text.match(jsonRegex);
  if (match && match[1]) {
    text = match[1];
  }

  try {
    const parsed = JSON.parse(text) as LetterResponse;
    // Basic validation (can be expanded)
    if (!parsed.content || typeof parsed.content !== 'string') {
      // Throw specific error for invalid content
      throw new Error('Invalid or missing content field');
    }
    if (!parsed.insights || typeof parsed.insights !== 'object') {
        // If insights are missing, create an empty object (this might be acceptable)
        console.warn('Insights object missing in AI response, creating empty one.');
        parsed.insights = {}; 
    }
    return parsed;
  } catch (error) {
    console.error('Error parsing AI letter response:', error);
    console.error('Raw AI response text:', responseText);
    // Throw an error instead of returning a fallback object
    throw new Error(`Failed to parse JSON from AI letter response: ${error instanceof Error ? error.message : String(error)}`);
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