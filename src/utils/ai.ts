import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclarationSchema, FunctionCallingMode } from '@google/generative-ai'
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

// Initialize Gemini AI
const apiKey = environment.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set')
}
const genAI = new GoogleGenerativeAI(apiKey)

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated model name

// Helper type for prompt sections
type PromptSection = { title: string; content: string; markdownFormat?: 'codeblock' | 'blockquote' | 'notes' };

// Simple Prompt Building Helper Function
function buildPrompt(
    persona: { name: string; style: string; tone: string } | null, // Allow null if no specific persona
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
  const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  console.log(`Selected challenge type: ${selectedType}`);

  const contextSections: PromptSection[] = [
    { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' },
    { 
        title: 'Student Preferences & Configuration', 
        content: `Configured Topics & Levels: ${JSON.stringify(config.topics)}\nAll Available Topics: ${allTopics.join(', ')}\nPreferred Difficulty: ${config.difficulty}/10\nRecent Challenge Topics (Avoid direct repeats): ${recentChallenges.map(c => c.topics).flat().join(', ') || 'No recent challenges'}\nPreferred Challenge Types: ${availableTypes.join(', ')}`
    }
  ];

  const instructions = [
    `Base the challenge on the student's progress documented in the Teacher's Notes and their preferences, considering the configured topics and their levels.`, // General instruction first
    `Generate a challenge of type: **${selectedType}**.`,
    `Adhere to the standard Challenge JSON schema structure.`,
    `Ensure difficulty aligns with student notes and preferred difficulty (${config.difficulty}/10).`,
    `Address weaknesses and build on strengths identified in the AI Teacher Notes.`,
    `Avoid directly repeating recent challenge topics.`,
    `Fill optional fields (hints, requirements, examples) only if appropriate for the selected type **${selectedType}**.`
  ];

  // Add type-specific reminders to instructions
  switch (selectedType) {
    case 'coding': instructions.push(`Reminder for 'coding': Focus on problem statement, requirements, examples.`); break;
    case 'iac': instructions.push(`Reminder for 'iac': Focus on task description, resources, example outputs.`); break;
    case 'question': instructions.push(`Reminder for 'question': Focus on clear question in description; requirements/examples likely empty.`); break;
    case 'mcq': instructions.push(`Reminder for 'mcq': Question in description, options in examples.`); break;
    case 'design': instructions.push(`Reminder for 'design': Scenario in description, constraints/focus in requirements.`); break;
    case 'casestudy': instructions.push(`Reminder for 'casestudy': Case study in description, questions in requirements.`); break;
    case 'project': instructions.push(`Reminder for 'project': Project outline in description, steps in requirements.`); break;
    default: instructions.push(`Reminder for default: Generate a standard coding challenge.`);
  }

  const outputFormatDescription = "Respond ONLY with the JSON object adhering to the Challenge schema.";
  // We are temporarily not enforcing schema via function calling, but still describe it.

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
      { title: 'Challenge Details', content: `Title: ${challenge.title}\nRequirements:\n${challenge.requirements.join('\n')}` },
      { title: 'AI Teacher Notes', content: aiMemory, markdownFormat: 'notes' },
      { title: 'Student Submission', content: submission.content, markdownFormat: 'codeblock' }
  ];

  const instructions = [
      `Review the student submission based on the challenge details and the student's history in the AI Teacher Notes.`,
      `Provide key strengths of the implementation in relation to the student's progress.`,
      `Identify areas for improvement, considering patterns noted in the memory.`,
      `Give specific suggestions for better approaches or refinements.`,
      `Provide a numerical score out of 100.`,
      `Recommend concrete next steps for improvement, relevant to the student's history.`
  ];

  const outputFormatDescription = `Format the response as a single JSON object matching the Feedback schema: { submissionId: string (use "${submission.challengeId}"), strengths: string[], weaknesses: string[], suggestions: string[], score: number, improvementPath: string, createdAt: string (ISO timestamp) }. Respond ONLY with this JSON object.`;

  return buildPrompt(
      mentorProfile, // Pass the mentor persona
      `Provide feedback on a student submission.`, // Task Description
      contextSections,
      instructions,
      outputFormatDescription
  );
}

// Fixed version of the generateChallenge function
// TEMPORARILY REVERTED Function Calling parsing due to TS type issues
// TODO: Revisit Function Calling implementation for robust JSON parsing
export async function generateChallenge(
  config: Config,
  aiMemory: string, 
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, aiMemory, recentChallenges);
  
  console.log('Generating challenge...'); // Removed mention of schema temporarily
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000; // 1 second
  let result;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
        // Removed tools and toolConfig temporarily
        result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
            }
            // tools: [...], // Removed
            // toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.ANY } } // Removed
        });
        lastError = null; // Success, clear last error
        break; // Exit loop on success
    } catch (error) { 
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Error calling AI model for challenge generation (Attempt ${attempt}/${MAX_RETRIES}):`, lastError);
        if (attempt < MAX_RETRIES) {
            console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
            console.error("Max retries reached for challenge generation.");
        }
    }
  }

  // If all retries failed, lastError will be set
  if (lastError || !result) {
      throw new Error(`AI API call failed after ${MAX_RETRIES} attempts during challenge generation: ${lastError?.message}`);
  }

  const response = result.response;
   if (!response) {
       throw new Error("AI API call returned no response during challenge generation.");
   }
   const text = response.text();
    if (typeof text !== 'string') {
        throw new Error("AI API call returned non-text response during challenge generation.");
    }
  console.log('Raw AI response:', text);

  // Use Zod schema for parsing and validation
  let challenge: Challenge;
  try {
    // Try parsing directly
    const parsedData = JSON.parse(text);
    challenge = ZodChallengeSchema.parse(parsedData); // Validate using Zod
  } catch (e) {
    console.error("Failed to parse/validate Challenge JSON directly:", e);
    
    // Updated Regex Fallback: Extract content within ```json ... ``` blocks
    const markdownJsonRegex = /```json\n([\s\S]*?)\n```/;
    const match = text.match(markdownJsonRegex);
    
    if (match && match[1]) {
      // match[1] contains the captured JSON string
      const extractedJson = match[1];
      try {
        console.log("Attempting to parse/validate extracted JSON from Markdown block...");
        const parsedFallback = JSON.parse(extractedJson);
        challenge = ZodChallengeSchema.parse(parsedFallback); // Validate fallback using Zod
        console.log("Successfully parsed JSON from Markdown block.");
      } catch (nestedE) {
        console.error("Fallback JSON parsing/validation failed.", nestedE);
        // Include Zod error details if available
        const errorDetails = nestedE instanceof Error ? nestedE.message : String(nestedE);
        throw new Error(`Extracted JSON from Markdown block was invalid: ${errorDetails}`);
      }
    } else {
      // If regex doesn't match, throw original error
      console.error("Could not find JSON within Markdown block.");
      const errorDetails = e instanceof Error ? e.message : String(e);
      throw new Error(`AI response did not contain valid Challenge JSON and was not in expected Markdown format: ${errorDetails}`);
    }
  }

  // Validation of ID/Timestamp and optional fields happens AFTER successful parsing
  // Zod handles required fields, types, and formats defined in the schema
  // Ensure the challenge has a valid ID (assign if missing)
  if (!challenge.id || typeof challenge.id !== 'string' || !challenge.id.match(/^CC-\d{3,}$/)) {
    const existingChallenges = await files.listChallenges();
    const existingIds = existingChallenges
      .map(id => id.match(/^CC-(\d+)/))
      .filter(match => match !== null)
      .map(match => parseInt(match![1], 10));
    
    const maxId = Math.max(0, ...existingIds);
    const newId = `CC-${String(maxId + 1).padStart(3, '0')}`;
    
    console.warn(`Generated challenge had invalid or missing ID (${challenge.id}). Assigning new ID: ${newId}`);
    challenge.id = newId;
  }
  
  // Ensure createdAt is set
  challenge.createdAt = challenge.createdAt || new Date().toISOString();
  
  // Basic validation of other required fields 
  if (!challenge.title || typeof challenge.title !== 'string') throw new Error('Challenge title is missing or invalid');
  if (!challenge.description || typeof challenge.description !== 'string') throw new Error('Challenge description is missing or invalid');
  // Initialize optional arrays if missing AFTER parsing
  if (!Array.isArray(challenge.requirements)) challenge.requirements = [];
  if (!Array.isArray(challenge.examples)) challenge.examples = [];
  if (!Array.isArray(challenge.hints)) challenge.hints = [];
  if (!Array.isArray(challenge.topics)) challenge.topics = [];
  if (typeof challenge.difficulty !== 'number' || challenge.difficulty < 1 || challenge.difficulty > 10) challenge.difficulty = config.difficulty; // Default to config difficulty

  return challenge;
}

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateFeedback(
  challenge: Challenge,
  submission: Submission,
  aiMemory: string, 
  mentorProfileName: string 
): Promise<Feedback> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName);
  const prompt = await generateFeedbackPrompt(challenge, submission, aiMemory, mentorProfile); // Pass aiMemory
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  let result;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
          result = await model.generateContent(prompt);
          lastError = null;
          break; // Exit loop on success
      } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Error calling AI model for feedback generation (Attempt ${attempt}/${MAX_RETRIES}):`, lastError);
          if (attempt < MAX_RETRIES) {
              console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
              console.error("Max retries reached for feedback generation.");
          }
      }
  }
  
  // If all retries failed, lastError will be set
   if (lastError || !result) {
       throw new Error(`AI API call failed after ${MAX_RETRIES} attempts during feedback generation: ${lastError?.message}`);
   }
  
  const response = result.response;
   if (!response) {
       throw new Error("AI API call returned no response during feedback generation.");
   }
   const textResponse = response.text(); 
    if (typeof textResponse !== 'string') {
        throw new Error("AI API call returned non-text response during feedback generation.");
    }
    
  let text = textResponse; 
  
  // Use Zod schema for parsing and validation
  let feedback: Feedback;
  try {
      // Try parsing directly from potential markdown block
      const jsonRegex = /```json\n([\s\S]*?)\n```/;
      const match = text.match(jsonRegex);
      const jsonToParse = match && match[1] ? match[1] : text; // Use extracted or original text
      const parsedData = JSON.parse(jsonToParse);
      feedback = ZodFeedbackSchema.parse(parsedData); // Validate using Zod
  } catch (e) {
      console.error("Failed to parse/validate Feedback JSON:", e);
      console.error("Raw AI Response Text (before potential extraction):", text);
       // Attempt to find JSON within potentially messy output ONLY if primary parse failed
       if (!(e instanceof SyntaxError)) { // Don't retry if it wasn't a basic JSON syntax error initially
           const nestedJsonMatch = text.match(/{[\s\S]*}/);
           if (nestedJsonMatch && nestedJsonMatch[0]) {
               try {
                   console.log("Attempting to parse/validate nested JSON as fallback...");
                   const parsedFallback = JSON.parse(nestedJsonMatch[0]);
                   feedback = ZodFeedbackSchema.parse(parsedFallback); // Validate fallback using Zod
               } catch (nestedE) {
                   console.error("Fallback JSON parsing/validation failed.", nestedE);
                   const errorDetails = nestedE instanceof Error ? nestedE.message : String(nestedE);
                   throw new Error(`AI response for feedback generation was not valid Feedback JSON, even with fallback parsing: ${errorDetails}`);
               }
           } else {
                const errorDetails = e instanceof Error ? e.message : String(e);
               throw new Error(`AI response for feedback generation did not contain valid Feedback JSON: ${errorDetails}`);
           }
       } else {
            const errorDetails = e instanceof Error ? e.message : String(e);
           throw new Error(`AI response for feedback generation was not valid Feedback JSON: ${errorDetails}`);
       }
  }

  // Ensure submissionId and createdAt are set AFTER successful parsing
  // Other fields are handled by Zod schema (required, types, defaults)
  feedback.submissionId = submission.challengeId; // Ensure submissionId matches challengeId
  feedback.createdAt = feedback.createdAt || new Date().toISOString(); // Use parsed or generate new

  return feedback;
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
  studentStatus: string // Added parameter
): Promise<LetterResponse> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName);
  const prompt = await generateLetterResponsePrompt(
    question,
    correspondence,
    aiMemory,
    mentorProfile,
    config,
    studentStatus // Pass status down
  );
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  let result;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
          result = await model.generateContent(prompt);
          lastError = null;
          break; // Exit loop on success
      } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Error calling AI model for letter response generation (Attempt ${attempt}/${MAX_RETRIES}):`, lastError);
          if (attempt < MAX_RETRIES) {
              console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
              console.error("Max retries reached for letter response generation.");
          }
      }
  }
  
  // If all retries failed, lastError will be set
   if (lastError || !result) {
       throw new Error(`AI API call failed after ${MAX_RETRIES} attempts during letter response generation: ${lastError?.message}`);
   }
  
  const response = result.response;
   if (!response) {
       throw new Error("AI API call returned no response during letter response generation.");
   }
   const text = response.text();
    if (typeof text !== 'string') {
        throw new Error("AI API call returned non-text response during letter response generation.");
    }
  
  try {
    // parseLetterResponse will now throw on error
    return await parseLetterResponse(text); 
  } catch (error) {
      console.error("Failed to parse letter response:", error);
      // Re-throw the parsing error
       throw new Error(`Failed to parse AI response for letter: ${error instanceof Error ? error.message : String(error)}`);
  }
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
// MODIFIED: Throws error on failure
export async function generateDigestSummary(
  aiMemory: string,
  digestType: 'weekly' | 'monthly' | 'quarterly'
): Promise<string> {
  const prompt = `Based on the following AI Teacher\'s Notes, please generate a concise narrative summary for a **${digestType}** student progress report. Focus on overall trends, significant achievements, persistent challenges, and potential focus areas for the upcoming period. Keep the tone encouraging but realistic.

--- START AI TEACHER\'S NOTES ---
${aiMemory}
--- END AI TEACHER\'S NOTES ---

Generate only the narrative summary text (markdown format allowed).`;

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  let result;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Generating ${digestType} digest summary from AI memory (Attempt ${attempt}/${MAX_RETRIES})...`);
        result = await model.generateContent(prompt);
        lastError = null;
        break; // Exit loop on success
      } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Error calling AI model for ${digestType} digest summary (Attempt ${attempt}/${MAX_RETRIES}):`, lastError);
          if (attempt < MAX_RETRIES) {
              console.log(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
              console.error(`Max retries reached for ${digestType} digest summary generation.`);
          }
      }
  }
  
  // If all retries failed, lastError will be set
   if (lastError || !result) {
       throw new Error(`AI API call failed after ${MAX_RETRIES} attempts during ${digestType} digest summary generation: ${lastError?.message}`);
   }
  
  const response = result.response;
   if (!response) {
       throw new Error(`AI API call returned no response during ${digestType} digest summary generation.`);
   }
   const summaryText = response.text();
    if (typeof summaryText !== 'string') {
        throw new Error(`AI API call returned non-text response during ${digestType} digest summary generation.`);
    }
    
  console.log(`AI ${digestType} digest summary generated successfully.`);
  return summaryText.trim();
}