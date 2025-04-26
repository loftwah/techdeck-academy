import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FunctionDeclarationSchema } from '@google/generative-ai'
import { environment } from '../config.js'
import * as files from './files.js'; // Import file utilities
import { readAIMemoryRaw } from './ai-memory-manager.js'; // Import memory reader
import * as profile from './profile-manager.js'; // Import profile manager for loadMentorProfile
import type { 
  Challenge, 
  StudentProfile, // Keep StudentProfile for types that might still use minimal version
  Feedback, 
  Config, 
  Submission, 
  MentorProfile,
  LetterResponse
} from '../types.js'

// Initialize Gemini AI
const apiKey = environment.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set')
}
const genAI = new GoogleGenerativeAI(apiKey)

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated model name

// Define the formal schema for the Challenge object
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
  required: ['id', 'title', 'description', 'difficulty', 'topics', 'createdAt'] 
};

// Updated generateChallengePrompt to handle flattened topics and remove subjectAreas
export async function generateChallengePrompt(
  config: Config,
  aiMemory: string,
  recentChallenges: Challenge[]
): Promise<string> {
  // Get all configured topics directly from the flattened structure
  const allTopics: string[] = Object.keys(config.topics); 

  // --- Select Challenge Type ---
  // Default to coding if not specified or empty
  const availableTypes = config.preferredChallengeTypes && config.preferredChallengeTypes.length > 0 
                         ? config.preferredChallengeTypes 
                         : ['coding'];
  // Simple random selection for now
  const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  console.log(`Selected challenge type: ${selectedType}`); // Log selected type

  const context = {
    recentTopics: recentChallenges.map(c => c.topics).flat(),
    preferredDifficulty: config.difficulty,
    allConfiguredTopics: allTopics, // Use flattened list
  };

  // --- Build Prompt with Type-Specific Instructions ---
  // References the definitions now included in the main aiMemory context
  let prompt = `Generate a challenge of type: **${selectedType}** (refer to System Definitions in notes if needed) based on the following context:

--- START AI TEACHER'S NOTES ---
${aiMemory} 
--- END AI TEACHER'S NOTES ---

Student Preferences & Configuration:
Configured Topics & Levels: ${JSON.stringify(config.topics)} 
All Available Topics: ${context.allConfiguredTopics.join(', ')}
Preferred Difficulty: ${context.preferredDifficulty}/10
Recent Challenge Topics (Avoid direct repeats): ${context.recentTopics.join(', ') || 'No recent challenges'}
Preferred Challenge Types: ${availableTypes.join(', ')}

Base the challenge on the student's progress documented in the Teacher's Notes and their preferences, considering the configured topics and their levels.
`;

  // Add concise type-specific generation reminders (full definitions are in memory)
  switch (selectedType) {
    case 'coding':
      prompt += `\nReminder for 'coding': Focus on problem statement, requirements, examples.`;
      break;
    case 'iac':
      prompt += `\nReminder for 'iac': Focus on task description, resources, example outputs.`;
      break;
    case 'question':
      prompt += `\nReminder for 'question': Focus on clear question in description; requirements/examples likely empty.`;
      break;
    case 'mcq':
      prompt += `\nReminder for 'mcq': Question in description, options in examples.`;
      break;
    case 'design':
       prompt += `\nReminder for 'design': Scenario in description, constraints/focus in requirements.`;
       break;
     case 'casestudy':
       prompt += `\nReminder for 'casestudy': Case study in description, questions in requirements.`;
       break;
     case 'project':
       prompt += `\nReminder for 'project': Project outline in description, steps in requirements.`;
       break;
    default:
      prompt += `\nReminder for default: Generate a standard coding challenge.`;
  }

  prompt += `\n\nGeneral Requirements:
- Adhere to the standard Challenge JSON schema structure.
- Ensure difficulty aligns with student notes.
- Address weaknesses and build on strengths from notes.
- Avoid recent topics.
- Fill optional fields (hints, requirements, examples) only if appropriate for the selected type **${selectedType}**.`; // Emphasize type

  return prompt;
}

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateFeedbackPrompt(
  challenge: Challenge,
  submission: Submission,
  aiMemory: string, // Changed parameter
  mentorProfile: MentorProfile
): Promise<string> {
  // Updated prompt to inject the AI Memory content
  return `Review this code submission with the following context:
Challenge: ${challenge.title}
Requirements: ${challenge.requirements.join('\n')}

--- START AI TEACHER'S NOTES ---
${aiMemory}
--- END AI TEACHER'S NOTES ---

Submission Content:
\`\`\`
${submission.content}
\`\`\`

Please provide feedback as the ${mentorProfile.name} mentor (${mentorProfile.style}, ${mentorProfile.tone}) using the AI Teacher's Notes for context on the student's journey. The feedback should include:
1. Key strengths of the implementation in relation to the student's progress.
2. Areas for improvement, considering patterns noted in the memory.
3. Specific suggestions for better approaches.
4. A score out of 100.
5. Recommended next steps for improvement, relevant to the student's history.

Format the response as a JSON Feedback object with fields: submissionId, strengths (string[]), weaknesses (string[]), suggestions (string[]), score (number), improvementPath (string), createdAt (ISO timestamp). Ensure the submissionId field is correctly set to "${submission.challengeId}".`;
}

// Fixed version of the generateChallenge function
export async function generateChallenge(
  config: Config,
  aiMemory: string, 
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, aiMemory, recentChallenges);
  
  console.log('Generating challenge with structured output schema...');
  
  let result;
  try {
      // Fixed request structure for Node.js SDK
      result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
              temperature: 0.7,
          },
          tools: [{
              functionDeclarations: [{
                  name: "generateChallenge",
                  description: "Generate a coding challenge",
                  parameters: ChallengeSchema as FunctionDeclarationSchema
              }]
          }]
      });
  } catch (error) {
      console.error("Error calling AI model for challenge generation:", error);
      // Consistently throw an error on API failure
      throw new Error(`AI API call failed during challenge generation: ${error instanceof Error ? error.message : String(error)}`);
  }

  const response = result.response;
  // It's possible response or text() could be null/undefined if API call failed in subtle ways
  if (!response) {
      throw new Error("AI API call returned no response during challenge generation.");
  }
  const text = response.text();
   if (typeof text !== 'string') {
       throw new Error("AI API call returned non-text response during challenge generation.");
   }
  console.log('Raw AI response:', text);

  let challenge: Challenge;
  try {
    // Try to parse the response as JSON directly
    challenge = JSON.parse(text) as Challenge;
  } catch (e) {
    console.error("Failed to parse Challenge JSON:", e);
    console.error("Raw AI Response Text:", text); 
    // Try to extract JSON with regex as fallback
    const jsonRegex = /{[[\s\S]]*}/; 
    const match = text.match(jsonRegex);
    if (match && match[0]) {
      try {
        console.log("Attempting to parse extracted JSON as fallback...");
        challenge = JSON.parse(match[0]) as Challenge;
      } catch (nestedE) {
        console.error("Fallback JSON parsing failed.", nestedE);
        throw new Error("AI response for challenge generation was not valid JSON, even with fallback parsing.");
      }
    } else {
      throw new Error("AI response for challenge generation did not contain valid JSON.");
    }
  }
  
  // Ensure the challenge has a valid ID
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
  if (!challenge.createdAt) {
    challenge.createdAt = new Date().toISOString();
  }
  
  // Basic validation of other fields
  if (!challenge.title || typeof challenge.title !== 'string') throw new Error('Challenge title is missing or invalid');
  if (!challenge.description || typeof challenge.description !== 'string') throw new Error('Challenge description is missing or invalid');
  if (!Array.isArray(challenge.requirements)) challenge.requirements = []; // Default to empty array if missing
  if (!Array.isArray(challenge.examples)) challenge.examples = [];
  if (typeof challenge.difficulty !== 'number' || challenge.difficulty < 1 || challenge.difficulty > 10) challenge.difficulty = config.difficulty; // Default to config difficulty
  if (!Array.isArray(challenge.topics)) challenge.topics = [];
  // Ensure hints is an array if present
  if (challenge.hints && !Array.isArray(challenge.hints)) challenge.hints = []; 
  // Add createdAt back if schema didn't enforce it (it should)
  if (!challenge.createdAt) challenge.createdAt = new Date().toISOString();

  return challenge;
}

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateFeedback(
  challenge: Challenge,
  submission: Submission,
  aiMemory: string, // Changed parameter
  mentorProfileName: string // Changed from profile object to name
): Promise<Feedback> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName); // Load mentor profile
  const prompt = await generateFeedbackPrompt(challenge, submission, aiMemory, mentorProfile); // Pass aiMemory
  
  let result;
  try {
      result = await model.generateContent(prompt);
  } catch (error) {
      console.error("Error calling AI model for feedback generation:", error);
       // Consistently throw an error on API failure
      throw new Error(`AI API call failed during feedback generation: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  const response = result.response;
   // It's possible response or text() could be null/undefined if API call failed in subtle ways
   if (!response) {
       throw new Error("AI API call returned no response during feedback generation.");
   }
   const textResponse = response.text(); // Renamed to avoid conflict with 'text' variable below
    if (typeof textResponse !== 'string') {
        throw new Error("AI API call returned non-text response during feedback generation.");
    }
    
  let text = textResponse; // Assign to 'text' for existing parsing logic
  
  // ... existing JSON extraction ...
  const jsonRegex = /```json\n([\s\S]*?)\n```/;
  const match = text.match(jsonRegex);
  if (match && match[1]) {
    text = match[1];
  }
  
  let feedback: Feedback;
   try {
    feedback = JSON.parse(text) as Feedback;
  } catch (e) {
      console.error("Failed to parse Feedback JSON:", e);
      console.error("Raw AI Response Text:", text);
       // Attempt to find JSON within potentially messy output
      const nestedJsonMatch = text.match(/{[\s\S]*}/);
      if (nestedJsonMatch && nestedJsonMatch[0]) {
          try {
              console.log("Attempting to parse nested JSON...");
              feedback = JSON.parse(nestedJsonMatch[0]) as Feedback;
          } catch (nestedE) {
              console.error("Failed to parse even nested JSON.", nestedE);
              throw new Error("AI response for feedback generation was not valid JSON.");
          }
      } else {
          throw new Error("AI response for feedback generation did not contain valid JSON.");
      }
  }

  // Ensure required fields are present
  if (!feedback.score || typeof feedback.score !== 'number' || feedback.score < 0 || feedback.score > 100) {
      console.warn('Feedback score missing or invalid, setting to 0.');
      feedback.score = 0;
  }
  if (!Array.isArray(feedback.strengths)) feedback.strengths = [];
  if (!Array.isArray(feedback.weaknesses)) feedback.weaknesses = [];
  if (!Array.isArray(feedback.suggestions)) feedback.suggestions = [];
  if (!feedback.improvementPath || typeof feedback.improvementPath !== 'string') feedback.improvementPath = "Review suggestions and try applying them."; // Default value
  
  feedback.submissionId = submission.challengeId; // Ensure submissionId matches challengeId
  feedback.createdAt = new Date().toISOString();

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
  // Prepare config details for the prompt
  const configDetails = `
Student Preferences & Configuration:
Configured Topics & Levels: ${JSON.stringify(config.topics)}
Preferred Difficulty: ${config.difficulty}/10
Preferred Challenge Types: ${config.preferredChallengeTypes?.join(', ') || 'Not specified'}
User Email: ${config.userEmail}
GitHub Username: ${config.githubUsername}
`;

  const basePrompt = `You are the ${mentorProfile.name} mentor (${mentorProfile.style}, ${mentorProfile.tone}). Respond to the student's letter below, using the AI Teacher's Notes and the student's configuration for context.

--- START AI TEACHER'S NOTES ---
${aiMemory}
--- END AI TEACHER'S NOTES ---

${configDetails}
Recent Correspondence (if any):
${correspondence.join('\n---\n')}

Student's Latest Letter:
"${question}"
`;

  let instructions = '';
  if (studentStatus === 'awaiting_introduction') {
    // Specific instructions for the *first* interaction / introduction letter
    instructions = `
Instructions:
1.  Acknowledge this is the student's introduction/first letter.
2.  Adopt your ${mentorProfile.name} persona (${mentorProfile.style}, ${mentorProfile.tone}) to provide a welcoming but character-appropriate response.
3.  Briefly acknowledge the student's stated goals or background from their letter.
4.  **Critically Important:** DO NOT assign technical tasks, request code examples, or give foundational exercises in this initial response. Mention that formal challenges will follow separately based on their configuration.
5.  Keep the response concise and encouraging in your persona's style.
6.  Generate insights based *only* on the content of THIS letter (sentiment, mentioned topics, flags like 'introduction').
`;
  } else {
    // Standard instructions for subsequent letters
    instructions = `
Instructions:
1.  Respond to the student's questions or comments in your ${mentorProfile.name} persona (${mentorProfile.style}, ${mentorProfile.tone}).
2.  Use the AI Teacher's Notes and recent correspondence for context.
3.  Provide clear answers or guidance.
4.  Generate relevant insights based on the conversation (sentiment, topics, strengths, weaknesses, flags).
`;
  }

  return `${basePrompt}
${instructions}
Format the response as a JSON LetterResponse object with fields: content (string, your response to the student), insights (LetterInsights object with optional fields: sentiment, strengths, weaknesses, topics, skillLevelAdjustment, flags).`;
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
  
  let result;
  try {
      result = await model.generateContent(prompt);
  } catch (error) {
      console.error("Error calling AI model for letter response generation:", error);
      throw new Error(`AI API call failed during letter response generation: ${error instanceof Error ? error.message : String(error)}`);
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

  let result;
  try {
    console.log(`Generating ${digestType} digest summary from AI memory...`);
    result = await model.generateContent(prompt);
  } catch (error) {
      console.error(`Error calling AI model for ${digestType} digest summary:`, error);
      throw new Error(`AI API call failed during ${digestType} digest summary generation: ${error instanceof Error ? error.message : String(error)}`);
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