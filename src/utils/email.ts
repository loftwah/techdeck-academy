import { Resend } from 'resend'
import { environment } from '../config.js'
import type { 
  Challenge, 
  Feedback, 
  EmailStyle, 
  Config 
} from '../types.js'

const resend = new Resend(environment.RESEND_API_KEY)

interface EmailContent {
  subject: string
  content: string
}

export async function formatChallengeEmail(
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<EmailContent> {
  const intros = {
    casual: "Hey there! Here's your next coding challenge 🚀",
    formal: "Your next programming challenge is ready for review.",
    technical: "New Technical Challenge Assignment"
  }

  const content = `
${intros[emailStyle]}

# ${challenge.title}

${challenge.description}

## Requirements
${challenge.requirements.map(r => `- ${r}`).join('\n')}

## Examples
${challenge.examples.map(e => `\`\`\`\n${e}\n\`\`\``).join('\n\n')}

${challenge.hints ? `## Hints
${challenge.hints.map(h => `- ${h}`).join('\n')}` : ''}

## Submission Instructions
Please submit your solution by creating a new file in the \`submissions\` directory.

Topics: ${challenge.topics.join(', ')}
Difficulty: ${challenge.difficulty}/10
`

  return {
    subject: `Challenge: ${challenge.title}`,
    content
  }
}

export async function formatFeedbackEmail(
  feedback: Feedback,
  submission: { challengeId: string },
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<EmailContent> {
  const intros = {
    casual: "Hey! Here's your feedback on the recent challenge 🎯",
    formal: "Your submission feedback is now available.",
    technical: "Code Review Feedback"
  }

  const content = `
${intros[emailStyle]}

# Feedback for ${challenge.title}

## Strengths
${feedback.strengths.map(s => `- ${s}`).join('\n')}

## Areas for Improvement
${feedback.weaknesses.map(w => `- ${w}`).join('\n')}

## Suggestions
${feedback.suggestions.map(s => `- ${s}`).join('\n')}

## Score: ${feedback.score}/100

## Next Steps
${feedback.improvementPath}
`

  return {
    subject: `Feedback: ${challenge.title}`,
    content
  }
}

export async function sendEmail(
  config: Config,
  content: EmailContent
): Promise<void> {
  try {
    await resend.emails.send({
      from: 'TechDeck Academy <academy@techdeck.life>',
      to: [config.userEmail],
      subject: content.subject,
      text: content.content, // Fallback plain text
      html: convertMarkdownToHtml(content.content) // You'd want to implement this
    })
  } catch (error) {
    console.error('Failed to send email:', error)
    throw error
  }
}

// Helper function to convert markdown to HTML
// This is a placeholder - you'd want to use a proper markdown parser
function convertMarkdownToHtml(markdown: string): string {
  // For now, just return the markdown as is
  // You should implement proper markdown to HTML conversion
  return markdown
} 