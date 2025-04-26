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
      { title: 'Challenge Details', content: `Title: ${challenge.title}\nRequirements:\n${challenge.requirements.join('\n')}` },
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
// TEMPORARILY REVERTED Function Calling parsing due to TS type issues
// TODO: Revisit Function Calling implementation for robust JSON parsing
export async function generateChallenge(
  config: Config,
  aiMemory: string, 
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, aiMemory, recentChallenges);
  
  console.log('Generating challenge (expecting Markdown response)...'); // Updated log
  
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
  console.log('Raw AI response:\n', text); // Keep raw response log

  // --- START REVISED MARKDOWN PARSING LOGIC ---

  const parsedData: Partial<Challenge> = {};

  // Helper function to extract content under a specific H2 heading
  const extractH2Content = (heading: string): string | null => {
    // Match H2 heading exactly, allowing for optional trailing whitespace
    // Capture content until the next H2/H1 heading or end of string
    // Dotall (s) flag allows '.' to match newlines
    const regex = new RegExp(`^## ${heading}\s*\n([\s\S]*?)(?=\n(?:## |# )|$)`, "im"); // Look for next ## or #
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : null;
  };

  // Helper function to parse bulleted lists (accepts * or -)
  const parseList = (content: string | null): string[] => {
      if (!content) return [];
      // Match lines starting with * or - (allowing leading whitespace)
      // Capture the text after the bullet and trim it
      return content.split('\n')
          .map(line => line.match(/^\s*[-*]\s*(.*)/))
          .filter(match => !!match) // Ensure match is not null
          .map(match => match![1].trim());
  };

  // --- Extract Title (H1) --- 
  let titleMatch = text.match(/^#\s+(.*?)(\n|$)/im); // Find first H1
  parsedData.title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : undefined;

  // --- Extract Description (H2) --- 
  parsedData.description = extractH2Content('Description') ?? undefined;
  // Fallback: If Description H2 not found, try finding the first H2 after the title
  if (!parsedData.description && parsedData.title) {
      const titleEndIndex = text.indexOf(parsedData.title) + parsedData.title.length;
      const textAfterTitle = text.substring(titleEndIndex);
      // Find the first H2 in the remaining text
      const firstH2Match = textAfterTitle.match(/^##\s+.*?\n([\s\S]*?)(?=\n(?:## |# )|$)/im);
      if (firstH2Match && firstH2Match[1]) {
          // Basic heuristic: If an H2 exists soon after H1, assume it's the description
          // We might need more robust logic if the structure varies wildly
          console.warn("Could not find '## Description'. Using content of the first H2 found after the title as description.");
          parsedData.description = firstH2Match[1].trim(); 
      }
  }
  // Fallback 2: If still no description, maybe grab text between H1 and next H2/H1?
  if (!parsedData.description && titleMatch) {
      const titleStartIndex = titleMatch.index ?? 0;
      const titleEndIndex = titleStartIndex + titleMatch[0].length;
      const nextHeadingMatch = text.substring(titleEndIndex).match(/\n(?:## |# )/);
      const endOfDescription = nextHeadingMatch ? titleEndIndex + (nextHeadingMatch.index ?? 0) : text.length;
      const potentialDescription = text.substring(titleEndIndex, endOfDescription).trim();
      if (potentialDescription) {
          console.warn("Could not find '## Description' or subsequent H2. Using text between H1 and next heading as description.");
          parsedData.description = potentialDescription;
      }
  }

  // --- Extract Topics (H2) --- 
  const topicsStr = extractH2Content('Topics');
  parsedData.topics = topicsStr ? topicsStr.split(',').map(t => t.trim()).filter(t => t) : [];

  // --- Extract Optional Sections (H2) --- 
  parsedData.requirements = parseList(extractH2Content('Requirements'));
  // Allow 'Options' as an alternative heading for MCQ examples
  const examplesContent = extractH2Content('Examples') ?? extractH2Content('Options');
  parsedData.examples = parseList(examplesContent);
  parsedData.hints = parseList(extractH2Content('Hints'));
  
  // Check if essential fields were extracted (after fallbacks)
  if (!parsedData.title || !parsedData.description) { 
      console.error("Failed to parse essential Title (H1) or Description (H2/Fallback) from AI Markdown response:", parsedData);
      console.error("Raw AI response was:\n", text); // Log raw text on error
      throw new Error(`Failed to parse essential fields (Title, Description) from AI's Markdown response. Check the raw AI response log.`);
  }

  // --- END REVISED MARKDOWN PARSING LOGIC ---

  // Now we have parsedData (from Markdown), proceed to augment and validate
  
  // Create a mutable object to hold challenge data
  let challengeData: Partial<Challenge> = parsedData; 

  // Ensure the challenge has a valid ID (assign if missing) BEFORE validation
  if (!challengeData.id || typeof challengeData.id !== 'string' || !challengeData.id.match(/^CC-\d{3,}$/)) {
    const existingChallenges = await files.listChallenges();
    const existingIds = existingChallenges
      .map(id => id.match(/^CC-(\d+)/))
      .filter(match => match !== null)
      .map(match => parseInt(match![1], 10));
    
    const maxId = Math.max(0, ...existingIds);
    const newId = `CC-${String(maxId + 1).padStart(3, '0')}`;
    
    console.warn(`Generated challenge had invalid or missing ID (${challengeData.id}). Assigning new ID: ${newId}`);
    challengeData.id = newId;
  }
  
  // Ensure createdAt is set BEFORE validation
  challengeData.createdAt = challengeData.createdAt || new Date().toISOString();
  
  // --- ASSIGN LOCALLY CONTROLLED FIELDS --- 
  // Determine selected type again (or pass it from prompt function if preferred)
  const allTopics: string[] = Object.keys(config.topics);
  const availableTypes = config.preferredChallengeTypes && config.preferredChallengeTypes.length > 0 
                         ? config.preferredChallengeTypes 
                         : ['coding'];
  const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)] as ChallengeType;
  challengeData.type = selectedType;
  
  // Assign difficulty from config
  challengeData.difficulty = config.difficulty;
  // --- END ASSIGN LOCALLY CONTROLLED FIELDS ---

  // NOW, validate the augmented object against the Zod schema
  let challenge: Challenge;
  try {
      // Now that Zod schema includes 'type', direct parsing should work
      challenge = ZodChallengeSchema.parse(challengeData); 
  } catch (zodError) {
      console.error("Zod validation failed after augmenting ID and createdAt:", zodError);
       // Include Zod error details if available
      const errorDetails = zodError instanceof Error ? zodError.message : String(zodError);
      throw new Error(`Challenge data failed validation after processing: ${errorDetails}`);
  }

  // Post-validation checks removed as Zod handles them
  // (e.g., title/description presence, array types are handled by the schema)

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
  
  // --- START NEW MARKDOWN PARSING LOGIC for Feedback ---
  console.log('Parsing feedback Markdown response...');
  console.log('Raw AI feedback response:\n', text);

  // Re-use helper functions from generateChallenge (assuming they are accessible or redefined here)
  // If not accessible, redefine extractContent and parseList here.
  // For brevity, assuming they are accessible/redefined:
  const extractContent = (heading: string): string | null => {
    const regex = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "im");
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : null;
  };
  const parseList = (content: string | null): string[] => {
    if (!content) return [];
    return content.split('\\n')
      .map(line => line.match(/^\\s*[-*]\\s*(.*)/))
      .filter(match => match !== null)
      .map(match => match![1].trim());
  };

  const parsedFeedback: Partial<Feedback> = {};

  parsedFeedback.strengths = parseList(extractContent('Strengths'));
  parsedFeedback.weaknesses = parseList(extractContent('Weaknesses'));
  parsedFeedback.suggestions = parseList(extractContent('Suggestions'));
  parsedFeedback.improvementPath = extractContent('Improvement Path') ?? 'No specific path provided.';

  // Basic check for essential feedback content (optional, adjust as needed)
  if (parsedFeedback.strengths.length === 0 && parsedFeedback.weaknesses.length === 0 && parsedFeedback.suggestions.length === 0) {
      console.warn('AI feedback response seemed empty or failed to parse headings (Strengths, Weaknesses, Suggestions). Check raw response.');
      // Decide if we should throw or allow empty feedback
  }

  // Construct the final Feedback object
  const feedback: Feedback = {
      submissionId: submission.challengeId, // Assign locally
      createdAt: new Date().toISOString(), // Assign locally
      strengths: parsedFeedback.strengths,
      weaknesses: parsedFeedback.weaknesses,
      suggestions: parsedFeedback.suggestions,
      improvementPath: parsedFeedback.improvementPath,
  };

  // No Zod validation needed here unless we redefine a Zod schema for Markdown-parsed fields
  // --- END NEW MARKDOWN PARSING LOGIC for Feedback ---

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