import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'
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
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set')
}
const genAI = new GoogleGenerativeAI(apiKey)

const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated model name

// Define the formal schema for the Challenge object using strings
const ChallengeSchema = {
  type: 'object', // Use string 'object'
  properties: {
    id: { type: 'string', description: "Unique challenge identifier (e.g., CC-001)" },
    title: { type: 'string', description: "Concise title for the challenge" },
    description: { type: 'string', description: "Detailed description of the challenge task" },
    requirements: { 
      type: 'array', // Use string 'array'
      items: { type: 'string' }, // Use string 'string'
      description: "List of specific requirements the solution must meet"
    },
    examples: { 
      type: 'array', 
      items: { type: 'string' },
      description: "Illustrative examples of input/output or usage"
    },
    hints: { 
      type: 'array', 
      items: { type: 'string' },
      description: "Optional hints to guide the student",
      nullable: true // Explicitly allow hints to be null or absent
    },
    difficulty: { type: 'number', description: "Difficulty rating from 1 to 10" }, // Use string 'number'
    topics: { 
      type: 'array', 
      items: { type: 'string' },
      description: "List of relevant technical topics covered"
    },
    createdAt: { type: 'string', format: "date-time", description: "ISO timestamp of creation" }
  },
  // Removed hints from required as it's optional
  required: ['id', 'title', 'description', 'requirements', 'examples', 'difficulty', 'topics', 'createdAt'] 
};

// Refactored: generateChallengePrompt - Removed explicit JSON formatting request
export async function generateChallengePrompt(
  config: Config,
  aiMemory: string, // Changed parameter
  recentChallenges: Challenge[] // Keep recentChallenges for specific avoidance
): Promise<string> {
  const allTopics: string[] = [];
  Object.entries(config.topics).forEach(([category, topics]) => {
    Object.keys(topics).forEach(topic => allTopics.push(topic));
  });

  const context = {
    recentTopics: recentChallenges.map(c => c.topics).flat(),
    preferredDifficulty: config.difficulty,
    allConfiguredTopics: allTopics,
    subjectAreas: config.subjectAreas
  };

  // Simplified prompt, relies on responseSchema for JSON format
  return `Generate a coding or technical challenge based on the following context:

--- START AI TEACHER'S NOTES ---
${aiMemory}
--- END AI TEACHER'S NOTES ---

Student Preferences & Configuration:
Subject Areas: ${context.subjectAreas.join(', ')}
All Available Topics: ${context.allConfiguredTopics.join(', ')}
Preferred Difficulty: ${context.preferredDifficulty}/10
Recent Challenge Topics (Avoid direct repeats): ${context.recentTopics.join(', ') || 'No recent challenges'}

Generate an appropriate challenge based on the student's progress documented in the Teacher's Notes and their preferences. The challenge type should match their subject areas:
- For programming, create a coding exercise with clear requirements, examples and test cases.
- For devops, create a practical infrastructure task with verification steps.
- For cloud (AWS/Azure/GCP), design a cloud architecture or implementation task.
- For networking, create a scenario that tests understanding of protocols and architecture.

The challenge should:
1. Be appropriately difficult considering the notes.
2. Help address weaknesses noted in the history.
3. Build upon strengths noted in the history.
4. Not repeat too similar topics from recent challenges listed above.
5. Include clear requirements and examples.
6. For coding challenges, provide example inputs and outputs.

Think step-by-step to create all the necessary fields for the challenge data structure (id, title, description, requirements, examples, hints, difficulty, topics, createdAt).`;
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

// Refactored: Uses responseSchema for reliable JSON output
export async function generateChallenge(
  config: Config,
  aiMemory: string, 
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, aiMemory, recentChallenges);
  
  console.log('Generating challenge with structured output schema...');
  
  // Correct structure for GenerateContentRequest with schema
  const request = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // generationConfig: {}, // Keep empty or add other configs like temperature if needed
      // Schema and MimeType are siblings to contents, not inside generationConfig
      responseMimeType: 'application/json',
      responseSchema: ChallengeSchema,
  };

  // Type assertion if needed, or ensure request matches GenerateContentRequest type
  const result = await model.generateContent(request as any); // Use type assertion or ensure type match

  const response = result.response;
  // With responseSchema, the text *should* be valid JSON directly
  // But keep robust parsing just in case.
  let text = response.text();
  console.log('Raw AI JSON response:', text);

  let challenge: Challenge;
  try {
    // Directly parse the text, assuming it's JSON due to schema
    challenge = JSON.parse(text) as Challenge;
  } catch (e) {
      console.error("Failed to parse Challenge JSON even with schema:", e);
      console.error("Raw AI Response Text:", text); 
      // Maybe try basic extraction again as a fallback?
      const jsonRegex = /{[\s\S]*}/; // More basic regex
      const match = text.match(jsonRegex);
       if (match && match[0]) {
          try {
              console.log("Attempting to parse extracted JSON as fallback...");
              challenge = JSON.parse(match[0]) as Challenge;
          } catch (nestedE) {
              console.error("Fallback JSON parsing failed.", nestedE);
              throw new Error("AI response for challenge generation was not valid JSON, even with schema and fallback parsing.");
          }
       } else {
           throw new Error("AI response for challenge generation did not contain valid JSON, even with schema.");
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
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let text = response.text();
  
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

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateLetterResponsePrompt(
  question: string,
  correspondence: string[],
  aiMemory: string, // Changed parameter
  mentorProfile: MentorProfile,
  config: Config
): Promise<string> {
  const recentMessages = correspondence.slice(-5).join('\n---\n');

  // Updated prompt to inject AI Memory
  return `Act as an AI mentor (${mentorProfile.name}) with the following profile:
Style: ${mentorProfile.style}
Tone: ${mentorProfile.tone}
Expertise: ${mentorProfile.expertise.join(', ')}

--- START AI TEACHER'S NOTES ---
${aiMemory}
--- END AI TEACHER'S NOTES ---

A student has sent the following question/letter:
---
${question}
---

Recent Correspondence (if any):
---
${recentMessages || 'No recent messages'}
---

Please provide a helpful and supportive response in the mentor's style and preferred email style (${config.emailStyle}). Address the student's question directly, using the AI Teacher's Notes for context about their progress and potential struggles. Also, analyze the student's letter for **new** insights (compared to the existing notes) into their understanding, challenges, and mindset.

Format your response as a JSON object matching the LetterResponse interface:
{
  "content": "<Your detailed response to the student's question, formatted in markdown>",
  "insights": {
    "strengths": ["<Newly identified strength 1>"], // Optional: Strengths observed *specifically* from this letter
    "weaknesses": ["<Newly identified weakness 1>"], // Optional: Weaknesses or confusion points observed *specifically* from this letter
    "topics": ["<Relevant topic 1>"], // Optional: Topics mentioned or implied *in this letter*
    "sentiment": "<positive|negative|neutral>", // Optional: Overall sentiment *of this letter*
    "skillLevelAdjustment": <number>, // Optional: Suggested micro-adjustment to skill level *based on this letter*
    "flags": ["<flag1>"] // Optional: Flags like 'confused', 'motivated' *based on this letter*
  }
}

Ensure the 'content' field is markdown formatted. The 'insights' should reflect *new observations* from this specific interaction.`;
}

// Refactored: Uses aiMemory string instead of StudentProfile object
export async function generateLetterResponse(
  question: string,
  correspondence: string[],
  aiMemory: string, // Changed parameter
  mentorProfileName: string, // Changed from profile object to name
  config: Config
): Promise<LetterResponse> {
  const mentorProfile = await profile.loadMentorProfile(mentorProfileName); // Load mentor profile
  const prompt = await generateLetterResponsePrompt(question, correspondence, aiMemory, mentorProfile, config); // Pass aiMemory
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  try {
    return await parseLetterResponse(text); // Use existing parser
  } catch (error) {
      console.error("Failed to generate or parse letter response.", error);
      // Provide a fallback response in case of error
      return {
          content: "I apologize, but I encountered an issue generating a full response. Could you please rephrase your question or try again later?",
          insights: { flags: ['ai_error'] }
      };
  }
}

// Ensure parseLetterResponse function definition exists
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
      throw new Error('Invalid or missing content field in AI response');
    }
    if (!parsed.insights || typeof parsed.insights !== 'object') {
        // If insights are missing, create an empty object
        console.warn('Insights object missing in AI response, creating empty one.');
        parsed.insights = {}; 
    }
    return parsed;
  } catch (error) {
    console.error('Error parsing AI letter response:', error);
    console.error('Raw AI response text:', responseText);
    // Fallback response if parsing fails
     return {
      content: `I encountered an issue processing my thoughts on your letter. Could you perhaps rephrase or clarify?\n\nRaw Error Data (for debugging):\n${responseText}`, // Include raw text for debugging
      insights: {} // Return empty insights on failure
    };
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

  try {
    console.log(`Generating ${digestType} digest summary from AI memory...`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summaryText = response.text();
    console.log(`AI ${digestType} digest summary generated successfully.`);
    return summaryText.trim();
  } catch (error) {
    console.error(`Error generating ${digestType} AI digest summary:`, error);
    return `Error: Could not generate AI summary for the ${digestType} report.`; // Fallback message
  }
}