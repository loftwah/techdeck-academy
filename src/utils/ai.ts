import { GoogleGenerativeAI } from '@google/generative-ai'
import { environment } from '../config.js'
import * as files from './files.js'; // Import file utilities
import type { 
  Challenge, 
  StudentProfile, 
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

const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

export async function generateChallengePrompt(
  config: Config,
  studentProfile: StudentProfile,
  recentChallenges: Challenge[]
): Promise<string> {
  // Extract all configured topics into a flat structure for context
  const allTopics: string[] = [];
  Object.entries(config.topics).forEach(([category, topics]) => {
    Object.keys(topics).forEach(topic => allTopics.push(topic));
  });

  const context = {
    studentLevel: studentProfile.currentSkillLevel,
    strengths: studentProfile.strengths,
    weaknesses: studentProfile.weaknesses,
    recentTopics: recentChallenges.map(c => c.topics).flat(),
    preferredDifficulty: config.difficulty,
    allConfiguredTopics: allTopics,
    subjectAreas: config.subjectAreas
  };

  return `Generate a coding or technical challenge for a student with the following context:
Student Level: ${context.studentLevel}/10
Strengths: ${context.strengths.join(', ') || 'Not yet determined'}
Weaknesses: ${context.weaknesses.join(', ') || 'Not yet determined'}
Subject Areas: ${context.subjectAreas.join(', ')}
All Available Topics: ${context.allConfiguredTopics.join(', ')}
Recent Topics: ${context.recentTopics.join(', ') || 'No recent challenges'}
Preferred Difficulty: ${context.preferredDifficulty}/10

Generate an appropriate challenge based on the student's profile. The challenge type should match their subject areas:
- For programming, create a coding exercise with clear requirements, examples and test cases.
- For devops, create a practical infrastructure task with verification steps.
- For cloud (AWS/Azure/GCP), design a cloud architecture or implementation task.
- For networking, create a scenario that tests understanding of protocols and architecture.

The challenge should:
1. Be appropriately difficult for their level
2. Help address their weaknesses if known
3. Build upon their strengths if known
4. Not repeat too similar topics from recent challenges
5. Include clear requirements and examples
6. For coding challenges, provide example inputs and outputs

Please format the response as a JSON Challenge object with:
- A unique ID (format: "CC-NNN" where NNN is a three-digit number)
- Clear title and description
- Specific requirements list (array of strings)
- Practical examples (array of strings or objects)
- Optional hints for guidance (array of strings)
- Appropriate difficulty rating (1-10)
- Relevant topic tags (array of strings)
- createdAt (current ISO timestamp)`;
}

export async function generateFeedbackPrompt(
  challenge: Challenge,
  submission: Submission,
  studentProfile: StudentProfile,
  mentorProfile: MentorProfile
): Promise<string> {
  return `Review this code submission with the following context:
Challenge: ${challenge.title}
Requirements: ${challenge.requirements.join('\n')}

Student Context:
- Current Level: ${studentProfile.currentSkillLevel}/10
- Strengths: ${studentProfile.strengths.join(', ')}
- Weaknesses: ${studentProfile.weaknesses.join(', ')}

Submission:
${submission.content}

Please provide feedback as ${mentorProfile} mentor, including:
1. Key strengths of the implementation
2. Areas for improvement
3. Specific suggestions for better approaches
4. A score out of 100
5. Recommended next steps for improvement

Format the response as a Feedback object.`
}

export async function generateChallenge(
  config: Config,
  studentProfile: StudentProfile,
  recentChallenges: Challenge[]
): Promise<Challenge> {
  const prompt = await generateChallengePrompt(config, studentProfile, recentChallenges)
  const result = await model.generateContent(prompt)
  const response = await result.response
  let text = response.text()
  
  // Extract JSON from markdown code block if present
  const jsonRegex = /```json\n([\s\S]*?)\n```/
  const match = text.match(jsonRegex)
  if (match && match[1]) {
    text = match[1]
  }
  
  // Parse and validate the response as a Challenge object
  let challenge = JSON.parse(text) as Challenge
  
  // Ensure the challenge has a valid ID
  if (!challenge.id || challenge.id === 'undefined') {
    // Generate a new ID with format CC-XXX where XXX is a three-digit number
    const existingChallenges = await files.listChallenges() // Use imported file utility
    const existingIds = existingChallenges.map(id => {
      const match = id.match(/CC-(\d+)/)
      return match ? parseInt(match[1], 10) : 0
    })
    
    const maxId = Math.max(0, ...existingIds)
    const newId = `CC-${String(maxId + 1).padStart(3, '0')}`
    
    console.warn(`Generated challenge had invalid ID (${challenge.id}). Assigning new ID: ${newId}`)
    challenge.id = newId
  }
  
  // Ensure createdAt is set
  if (!challenge.createdAt) {
    challenge.createdAt = new Date().toISOString()
  }
  
  return challenge
}

export async function generateFeedback(
  challenge: Challenge,
  submission: Submission,
  studentProfile: StudentProfile,
  mentorProfile: MentorProfile
): Promise<Feedback> {
  const prompt = await generateFeedbackPrompt(challenge, submission, studentProfile, mentorProfile)
  const result = await model.generateContent(prompt)
  const response = await result.response
  let text = response.text()
  
  // Extract JSON from markdown code block if present
  const jsonRegex = /```json\n([\s\S]*?)\n```/
  const match = text.match(jsonRegex)
  if (match && match[1]) {
    text = match[1]
  }
  
  // Parse and validate the response as a Feedback object
  // This is a simplified version - you'd want more robust parsing
  const feedback = JSON.parse(text) as Feedback
  return feedback
}

// Add more AI utility functions as needed

export async function generateLetterResponsePrompt(
  question: string,
  correspondence: string[], // Array of past messages (optional context)
  studentProfile: StudentProfile,
  mentorProfile: MentorProfile,
  config: Config
): Promise<string> {
  const recentMessages = correspondence.slice(-5).join('\n---\n'); // Last 5 messages for context

  return `Act as an AI mentor (${mentorProfile.name}) with the following profile:
Style: ${mentorProfile.style}
Tone: ${mentorProfile.tone}
Expertise: ${mentorProfile.expertise.join(', ')}

A student has sent the following question/letter:
---
${question}
---

Student Context:
- Current Level: ${studentProfile.currentSkillLevel}/10
- Strengths: ${studentProfile.strengths.join(', ') || 'N/A'}
- Weaknesses: ${studentProfile.weaknesses.join(', ') || 'N/A'}
- Recent Topics: ${studentProfile.recentTopics?.join(', ') || 'N/A'}
- Learning Goals: ${studentProfile.learningGoals?.join(', ') || 'N/A'}
- Subject Areas: ${config.subjectAreas.join(', ')}

Recent Correspondence (if any):
---
${recentMessages || 'No recent messages'}
---

Please provide a helpful and supportive response in the mentor's style (${config.emailStyle}). Address the student's question directly. Also, analyze the student's letter for insights into their understanding, challenges, and mindset.

Format your response as a JSON object matching the LetterResponse interface:
{
  "content": "<Your detailed response to the student's question, formatted in markdown>",
  "insights": {
    "strengths": ["<Identified strength 1>", "<Identified strength 2>"], // Optional: Strengths observed from the letter
    "weaknesses": ["<Identified weakness 1>"], // Optional: Weaknesses or confusion points observed
    "topics": ["<Relevant topic 1>", "<Relevant topic 2>"], // Optional: Topics mentioned or implied
    "sentiment": "<positive|negative|neutral>", // Optional: Overall sentiment of the letter
    "skillLevelAdjustment": <number>, // Optional: Suggested micro-adjustment to skill level (e.g., 0.1 or -0.1)
    "flags": ["<flag1>"] // Optional: Flags like 'confused', 'motivated', 'needs_clarification'
  }
}

Ensure the 'content' field is formatted appropriately for an email/markdown response. The 'insights' should be based *only* on the student's letter provided.`;
}

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
      content: `I encountered an issue processing my thoughts on your letter. Could you perhaps rephrase or clarify?
\nRaw Error Data (for debugging):
${responseText}`, // Include raw text for debugging
      insights: {} // Return empty insights on failure
    };
  }
}

export async function generateLetterResponse(
  question: string,
  correspondence: string[],
  studentProfile: StudentProfile,
  mentorProfile: MentorProfile,
  config: Config
): Promise<LetterResponse> {
  const prompt = await generateLetterResponsePrompt(
    question,
    correspondence,
    studentProfile,
    mentorProfile,
    config
  );
  
  console.log('Generating letter response with prompt...'); // Add logging
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text();
  console.log('Received raw response from AI.'); // Add logging
  
  const parsedResponse = await parseLetterResponse(responseText);
  console.log('Successfully parsed AI response.'); // Add logging
  return parsedResponse;
} 