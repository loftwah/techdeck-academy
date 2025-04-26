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

  strong({ tokens }) {
    const text = getTextFromTokens(tokens);
    return `<strong style="font-weight: bold; color: inherit;">${text}</strong>`;
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

// Convert markdown to styled HTML with fallback
const markdownToHtml = async (markdown: string): Promise<string> => {
  try {
      // Ensure markdown is a string before parsing
      if (typeof markdown !== 'string') {
          console.warn('markdownToHtml received non-string input, returning empty string.');
          return '';
      }
      return await marked.parse(markdown); // Use the configured marked instance
  } catch (error) {
      console.error("Markdown parsing failed:", error);
      console.error("Original Markdown content:", markdown); // Log the problematic markdown
      // Fallback: Return the original markdown wrapped in <pre> tags
      // Escape the markdown content to prevent potential HTML injection in the fallback
      const escapedMarkdown = escapeHtml(markdown);
      return `<p style="color: red; font-weight: bold;">Error rendering email content. Displaying raw content:</p><pre style="background-color: #eee; padding: 10px; border: 1px solid #ccc; white-space: pre-wrap; word-wrap: break-word;">${escapedMarkdown}</pre>`;
  }
};

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

// --- NEW Email Formatting Helpers ---

// Creates a standard section with a heading
function createEmailSection(title: string, content: string, headingLevel: number = 2): string {
    if (!content || content.trim() === '' || content.trim() === 'None') return ''; // Don't render empty sections
    return `\n## ${title}\n${content}\n`;
}

// Creates a markdown bulleted list from an array
function createBulletedList(items: string[]): string {
    if (!items || items.length === 0) return 'None provided';
    return items.map(item => `- ${item}`).join('\n');
}

// Creates a markdown code block
function createCodeBlock(content: string, language: string = ''): string {
    return `\`\`\`${language}\n${content}\n\`\`\``;
}

// --- Refactored Email Formatters ---

export async function formatChallengeEmail(
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  const formattedExamples = challenge.examples && challenge.examples.length > 0
    ? challenge.examples.map(ex => createCodeBlock(typeof ex === 'object' ? JSON.stringify(ex, null, 2) : ex, typeof ex === 'object' ? 'json' : '')).join('\n\n')
    : 'None provided';

  let markdown = getGreeting(emailStyle);
  markdown += `\n\n# ${challenge.title}\n\n${challenge.description}`; // Main title and description
  
  markdown += createEmailSection('Requirements', createBulletedList(challenge.requirements));
  markdown += createEmailSection('Examples', formattedExamples);
  if (challenge.hints && challenge.hints.length > 0) {
      markdown += createEmailSection('Hints', createBulletedList(challenge.hints));
  }
  
  const submissionInstructions = [
      `Create your solution (filename should include the challenge ID: ${challenge.id})`, // Add ID instruction
      `Save it in the \`submissions/\` directory`, // Use backticks for code style
      `Commit and push your changes`
  ];
  markdown += createEmailSection('Submission Instructions', submissionInstructions.map((item, index) => `${index + 1}. ${item}`).join('\n'), 2);

  markdown += '\n\nGood luck! 🚀';

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
  let markdown = getGreeting(emailStyle);
  markdown += `\n\n# Feedback for: ${challenge.title}`;

  markdown += createEmailSection('Score', `${feedback.score}/100`, 2);
  markdown += createEmailSection('Strengths', createBulletedList(feedback.strengths), 2);
  markdown += createEmailSection('Areas for Improvement', createBulletedList(feedback.weaknesses), 2);
  markdown += createEmailSection('Suggestions', createBulletedList(feedback.suggestions), 2);
  markdown += createEmailSection('Next Steps', feedback.improvementPath, 2);

  markdown += '\n\nKeep up the great work! 💪';

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

1. Challenges: Based on your configuration, you'll receive challenges ${scheduleDescription}.

2. Submissions: When you complete a challenge, save your solution in the \`submissions/\` directory with the challenge ID in the filename.

3. Feedback: After you submit, I'll review your work and provide feedback based on my teaching style (${mentorProfile.style}, ${mentorProfile.tone}) and your progress.

4. Questions: If you have questions, place a markdown file in the \`letters/to-mentor/\` directory. I'll respond promptly.

## About Me

${mentorProfile.description}
My expertise areas include: ${mentorProfile.expertise.join(', ')}.

## Next Steps

Please send me a letter: Place a markdown file in \`letters/to-mentor/\` telling me about:
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

function validateEmailContent(content: { subject: string; html: string }): void {
  if (!content.subject || typeof content.subject !== 'string' || content.subject.trim() === '') {
    throw new Error('Email subject is missing or invalid.');
  }
  if (!content.html || typeof content.html !== 'string' || content.html.trim() === '') {
    throw new Error('Email HTML content is missing or invalid.');
  }
  // Basic check for potentially malformed HTML (very basic)
  if (!content.html.includes('<html') || !content.html.includes('</body>')) {
    console.warn('Email HTML content might be missing basic structure.');
  }
}

// Updated sendEmail function with integrated retry logic
export async function sendEmail(
  config: Config,
  content: { subject: string; html: string },
  maxRetries = 3,
  retryDelay = 1500 // Slightly increased delay
): Promise<void> {
  // 1. Validate Content
  try {
    validateEmailContent(content);
  } catch (validationError) {
    console.error("Email content validation failed:", validationError);
    // Do not attempt to send invalid content
    throw validationError; 
  }

  const mailOptions = {
    from: 'TechDeck Academy <academy@techdeck.life>', // Replace with your verified sender
    to: config.userEmail,
    subject: content.subject,
    html: content.html,
  };

  // 2. Attempt Sending with Retry
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to send email (Attempt ${attempt}/${maxRetries}): "${content.subject}" to ${config.userEmail}`);
      const { data, error } = await resend.emails.send(mailOptions);

      if (error) {
        // Treat Resend's error object as the error to handle
        throw error; 
      }

      // Success
      console.log(`Email sent successfully! ID: ${data?.id}`);
      return; // Exit function on success

    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Email send attempt ${attempt}/${maxRetries} failed:`, lastError);

        // TODO: Check for specific non-retryable error codes from Resend if needed
        // if (isPermanentResendError(error)) { break; } 

        if (attempt < maxRetries) {
            console.log(`Retrying email send in ${retryDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
            console.error("Max retries reached for sending email.");
        }
    }
  }

  // If loop finishes, all retries failed
  if (lastError) {
    // Optional: Send notification about persistent email failure?
    throw new Error(`Failed to send email "${content.subject}" after ${maxRetries} attempts: ${lastError.message}`);
  }
}

// Export types only
export type {
  DigestData,
  DigestStats
} 