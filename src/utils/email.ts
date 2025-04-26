import { marked } from 'marked'
import type { Renderer, Token } from 'marked'
import { Resend } from 'resend'
import { environment } from '../config.js'
import type { 
  Challenge, 
  Feedback, 
  EmailStyle, 
  Config,
  MentorProfile,
  LetterResponse
} from '../types.js'

const resend = new Resend(environment.RESEND_API_KEY)

// Configure marked options for secure and styled HTML output
marked.setOptions({
  breaks: true, // Convert line breaks to <br>
  gfm: true, // Enable GitHub Flavored Markdown
})

// Custom renderer to add email-safe styling
const renderer = new marked.Renderer()

// Style headers appropriately for email
const sizes: Record<number, string> = {
  1: '24px',
  2: '20px',
  3: '18px',
  4: '16px',
  5: '14px',
  6: '12px'
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

// Helper function to safely get text from tokens
function getTextFromTokens(tokens: Token[]): string {
  return tokens
    .map(token => {
      if ('text' in token) {
        return token.text
      }
      return ''
    })
    .join('')
}

// Override renderer methods with type-safe implementations
const customRenderer: Partial<Renderer> = {
  heading({ tokens, depth }) {
    const text = getTextFromTokens(tokens)
    return `<h${depth} style="font-size: ${sizes[depth]}; margin-top: 20px; margin-bottom: 10px; font-weight: 600; color: #2D3748;">${text}</h${depth}>`
  },

  code({ text, escaped }) {
    const code = escaped ? text : escapeHtml(text)
    return `<pre style="background-color: #F7FAFC; padding: 16px; border-radius: 8px; overflow-x: auto;"><code>${code}</code></pre>`
  },

  codespan({ text }) {
    return `<code style="background-color: #F7FAFC; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${text}</code>`
  },

  blockquote({ tokens }) {
    const text = getTextFromTokens(tokens)
    return `<blockquote style="border-left: 4px solid #CBD5E0; margin: 0; padding-left: 16px; color: #4A5568;">${text}</blockquote>`
  },

  link({ href, title, tokens }) {
    const text = getTextFromTokens(tokens)
    return `<a href="${href}" style="color: #4299E1; text-decoration: none;" ${title ? `title="${title}"` : ''}>${text}</a>`
  },

  list(token) {
    const items = token.items.map(item => `<li>${getTextFromTokens(item.tokens)}</li>`).join('')
    return `<${token.ordered ? 'ol' : 'ul'} style="padding-left: 24px; margin: 16px 0;">${items}</${token.ordered ? 'ol' : 'ul'}>`
  }
}

// Apply the custom renderer
Object.assign(renderer, customRenderer)
marked.use({ renderer })

// Base email template
export const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2D3748; max-width: 800px; margin: 0 auto; padding: 20px;">
  ${content}
  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;">
  <footer style="color: #718096; font-size: 14px;">
    <p>TechDeck Academy - AI-Powered Learning Platform</p>
  </footer>
</body>
</html>
`

// Convert markdown to styled HTML
const markdownToHtml = async (markdown: string): Promise<string> => {
  return await marked.parse(markdown)
}

// Get appropriate greeting based on email style
const getGreeting = (style: EmailStyle): string => {
  switch (style) {
    case 'casual':
      return 'Hey there! 👋'
    case 'formal':
      return 'Dear Student,'
    case 'technical':
      return 'Greetings,'
    default:
      return 'Hello,'
  }
}

export async function formatChallengeEmail(
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  // Format examples properly
  const formattedExamples = challenge.examples.map(ex => {
    // If example is an object, format it properly
    if (typeof ex === 'object' && ex !== null) { // Check for null too
      return `\`\`\`json\n${JSON.stringify(ex, null, 2)}\n\`\`\``; // Add json tag
    }
    return `\`\`\`\n${ex}\n\`\`\``;
  }).join('\n\n');

  const markdown = `
${getGreeting(emailStyle)}

# ${challenge.title}

${challenge.description}

## Requirements
${challenge.requirements.map(req => `- ${req}`).join('\n')}

## Examples
${formattedExamples} // Use the formatted examples

${challenge.hints ? `## Hints\n${challenge.hints.map(hint => `- ${hint}`).join('\n')}` : ''}

## Submission Instructions
1. Create your solution (filename should include the challenge ID: ${challenge.id}) // Add ID instruction
2. Save it in the \`submissions/\` directory
3. Commit and push your changes

Good luck! 🚀
`

  return {
    subject: `New Challenge: ${challenge.title}`,
    html: baseTemplate(await markdownToHtml(markdown))
  }
}

export async function formatFeedbackEmail(
  feedback: Feedback,
  submission: { challengeId: string },
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  const markdown = `
${getGreeting(emailStyle)}

# Feedback for: ${challenge.title}

## Score: ${feedback.score}/100

## Strengths
${feedback.strengths.map(s => `- ${s}`).join('\n')}

## Areas for Improvement
${feedback.weaknesses.map(w => `- ${w}`).join('\n')}

## Suggestions
${feedback.suggestions.map(s => `- ${s}`).join('\n')}

## Next Steps
${feedback.improvementPath}

Keep up the great work! 💪
`

  return {
    subject: `Feedback: ${challenge.title}`,
    html: baseTemplate(await markdownToHtml(markdown))
  }
}

// Add types for digest data
interface DigestStats {
  challengesCompleted: number
  averageScore: number
  topicsProgress: Record<string, number>
  strengths: string[]
  areasForImprovement: string[]
}

interface DigestData {
  type: 'weekly' | 'monthly' | 'quarterly'
  period: {
    start: string
    end: string
  }
  stats: DigestStats
  recommendations: string[]
  nextSteps: string[]
}

export async function formatDigestEmail(
  digest: DigestData,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  const periodType = digest.type.charAt(0).toUpperCase() + digest.type.slice(1)
  const markdown = `
${getGreeting(emailStyle)}

# Your ${periodType} Learning Digest

## Period: ${new Date(digest.period.start).toLocaleDateString()} - ${new Date(digest.period.end).toLocaleDateString()}

### Progress Overview
- Challenges Completed: ${digest.stats.challengesCompleted}
- Average Score: ${digest.stats.averageScore.toFixed(1)}/100

### Topic Progress
${Object.entries(digest.stats.topicsProgress)
  .map(([topic, progress]) => `- ${topic}: ${(progress * 100).toFixed(1)}% complete`)
  .join('\n')}

### Strengths
${digest.stats.strengths.map(s => `- ${s}`).join('\n')}

### Areas for Improvement
${digest.stats.areasForImprovement.map(a => `- ${a}`).join('\n')}

### Recommendations
${digest.recommendations.map(r => `- ${r}`).join('\n')}

## Next Steps
${digest.nextSteps.map(s => `- ${s}`).join('\n')}

Keep pushing forward! 🚀
`

  return {
    subject: `Your ${periodType} TechDeck Academy Progress Report`,
    html: baseTemplate(await markdownToHtml(markdown))
  }
}

// Add the new welcome email function
export async function formatWelcomeEmail(
  config: Config,
  mentorProfile: MentorProfile
): Promise<{ subject: string; html: string }> {
  // Determine schedule description
  let scheduleDescription = 'on a schedule you define'
  if (config.schedule.challengeFrequency === 'daily') {
    scheduleDescription = 'on a daily basis'
  } else if (config.schedule.challengeFrequency === 'threePerWeek') {
    scheduleDescription = 'on Mondays, Wednesdays, and Fridays'
  } else if (config.schedule.challengeFrequency === 'weekly') {
    scheduleDescription = 'every Monday'
  } else if (config.schedule.challengeFrequency === 'manual') {
    scheduleDescription = 'manually when you trigger the action'
  }

  const markdown = `
${getGreeting(config.emailStyle)}

# Welcome to TechDeck Academy!

I'll be your ${mentorProfile.name} mentor for your journey in learning ${Object.keys(config.topics).join(', ')}.

## How This Works

1. **Challenges:** Based on your configuration, you'll receive challenges ${scheduleDescription}.

2. **Submissions:** When you complete a challenge, save your solution in the \`submissions/\` directory with the challenge ID in the filename.

3. **Feedback:** After you submit, I'll review your work and provide feedback based on my teaching style (${mentorProfile.style}, ${mentorProfile.tone}) and your progress.

4. **Questions:** If you have questions, place a markdown file in the \`letters/to-mentor/\` directory. I'll respond promptly.

## About Me

${mentorProfile.description}
My expertise areas include: ${mentorProfile.expertise.join(', ')}.

## Next Steps

**Please send me a letter:** Place a markdown file in \`letters/to-mentor/\` telling me about:
- Your current skills
- What you want to learn
- How you prefer to learn
- Any specific areas you want to focus on

I'll use this to tailor your learning experience.

Looking forward to working with you!
`

  return {
    subject: `Welcome to TechDeck Academy - Your Learning Journey Begins`,
    html: baseTemplate(await markdownToHtml(markdown))
  }
}

export async function formatLetterResponseEmail(
  response: LetterResponse,
  originalQuestion: string,
  emailStyle: EmailStyle,
  mentorName: string
): Promise<{ subject: string; html: string }> {
  const markdown = `
${getGreeting(emailStyle)}

I received your letter regarding:
> ${originalQuestion.split('\n')[0]}... 

Here are my thoughts:

---

${response.content} 

---

Best regards,

${mentorName}
(Your AI Mentor)
`;

  return {
    subject: `Re: Your recent question - Mentor Response`,
    html: baseTemplate(await markdownToHtml(markdown))
  };
}

// Add error handling wrapper for email sending
export async function sendEmailWithRetry(
  config: Config,
  content: { subject: string; html: string },
  maxRetries = 3,
  retryDelay = 1000
): Promise<void> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendEmail(config, content)
      return
    } catch (error) {
      lastError = error as Error
      console.error(`Email sending attempt ${attempt} failed:`, error)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
      }
    }
  }

  throw new Error(`Failed to send email after ${maxRetries} attempts. Last error: ${lastError?.message}`)
}

// Add email validation helper
function validateEmailContent(content: { subject: string; html: string }): void {
  if (!content.subject || typeof content.subject !== 'string') {
    throw new Error('Email subject is required and must be a string')
  }
  
  if (!content.html || typeof content.html !== 'string') {
    throw new Error('Email HTML content is required and must be a string')
  }
  
  if (content.subject.length > 100) {
    throw new Error('Email subject is too long (max 100 characters)')
  }
  
  if (content.html.length > 100000) {
    throw new Error('Email HTML content is too long (max 100KB)')
  }
}

// Update the sendEmail function with validation
export async function sendEmail(
  config: Config,
  content: { subject: string; html: string }
): Promise<void> {
  // Validate email content before sending
  validateEmailContent(content)

  try {
    await resend.emails.send({
      from: 'TechDeck Academy <academy@techdeck.life>',
      to: [config.userEmail],
      subject: content.subject,
      html: content.html,
    })
  } catch (error) {
    // Add more specific error handling
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        throw new Error('Email rate limit exceeded. Please try again later.')
      } else if (error.message.includes('invalid email')) {
        throw new Error(`Invalid email address: ${config.userEmail}`)
      } else if (error.message.includes('unauthorized')) {
        throw new Error('Invalid API key or authentication failed')
      }
    }
    throw error
  }
}

// Export types only
export type {
  DigestData,
  DigestStats
} 