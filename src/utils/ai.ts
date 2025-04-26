import { GoogleGenerativeAI } from '@google/generative-ai'
import { environment } from '../config.js'
import type { 
  Challenge, 
  StudentProfile, 
  Feedback, 
  Config, 
  Submission, 
  MentorProfile 
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
  const context = {
    studentLevel: studentProfile.currentSkillLevel,
    strengths: studentProfile.strengths,
    weaknesses: studentProfile.weaknesses,
    recentTopics: recentChallenges.map(c => c.topics).flat(),
    preferredDifficulty: config.difficulty
  }

  return `Generate a coding challenge for a student with the following context:
Student Level: ${context.studentLevel}/10
Strengths: ${context.strengths.join(', ')}
Weaknesses: ${context.weaknesses.join(', ')}
Recent Topics: ${context.recentTopics.join(', ')}
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
- Relevant topic tags`
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
  const text = response.text()
  
  // Parse and validate the response as a Challenge object
  // This is a simplified version - you'd want more robust parsing
  const challenge = JSON.parse(text) as Challenge
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
  const text = response.text()
  
  // Parse and validate the response as a Feedback object
  // This is a simplified version - you'd want more robust parsing
  const feedback = JSON.parse(text) as Feedback
  return feedback
}

// Add more AI utility functions as needed 