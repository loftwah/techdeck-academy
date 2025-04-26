import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import necessary function for ESM __dirname
import * as handlebars from 'handlebars'; // Import Handlebars
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

// Correctly define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to escape HTML (potentially still useful for specific data within templates)
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

// --- Template Loading and Compilation --- 

// Cache for compiled templates
const templateCache: Record<string, handlebars.TemplateDelegate> = {};

async function loadAndCompileTemplate(templateName: string): Promise<handlebars.TemplateDelegate> {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }

  // Construct path based on GITHUB_WORKSPACE, relative to project root in container
  const workspaceDir = process.env.GITHUB_WORKSPACE;
  if (!workspaceDir) {
    // Fallback or error handling if GITHUB_WORKSPACE is not set (e.g., local dev)
    // For now, let's throw an error, but you might want a different fallback.
    console.error('GITHUB_WORKSPACE environment variable is not set.');
    // Attempting previous method as a fallback (might work in local dev)
    try {
      const fallbackFilename = fileURLToPath(import.meta.url);
      const fallbackDirname = path.dirname(fallbackFilename);
      const fallbackPath = path.resolve(fallbackDirname, '../email-templates', `${templateName}.hbs`);
      console.log(`Attempting fallback template path: ${fallbackPath}`);
      const templateSource = await fs.readFile(fallbackPath, 'utf-8');
      const compiledTemplate = handlebars.compile(templateSource);
      templateCache[templateName] = compiledTemplate; // Cache the compiled template
      return compiledTemplate;
    } catch (fallbackError) {
       console.error('Fallback template loading failed:', fallbackError);
       throw new Error('Could not determine template path. GITHUB_WORKSPACE not set and fallback failed.');
    }
  }
  
  // Adjust templateDir to point directly to dist, as publicDir copies files there
  const templateDir = path.join(workspaceDir, 'dist'); 
  const templatePath = path.join(templateDir, `${templateName}.hbs`);
  console.log(`Attempting to load template from: ${templatePath}`); // Add logging

  try {
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const compiledTemplate = handlebars.compile(templateSource);
    templateCache[templateName] = compiledTemplate; // Cache the compiled template
    return compiledTemplate;
  } catch (error) {
    console.error(`Error loading or compiling template ${templateName}:`, error);
    throw new Error(`Could not load email template: ${templateName}`);
  }
}

// Base email template (HTML structure)
// Consider moving this structure into a layout.hbs file later if needed
export const baseTemplateWrapper = (content: string) => `
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
`;

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

// --- Refactored Email Formatters ---

export async function formatChallengeEmail(
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  try {
    const template = await loadAndCompileTemplate('challenge');
    
    // Prepare data for the template
    // Handle potential complexity in examples (e.g., marking code blocks)
    const templateData = {
      greeting: getGreeting(emailStyle),
      challenge: {
        ...challenge,
        // Process examples if needed for specific formatting in the template
        // For now, assume examples are simple strings or handled by template logic
        // examples: challenge.examples?.map(ex => (
        //    typeof ex === 'object' ? { isCodeBlock: true, content: JSON.stringify(ex, null, 2) } : { isCodeBlock: false, content: ex }
        // )) ?? []
      }
    };

    const renderedContent = template(templateData);
    const finalHtml = baseTemplateWrapper(renderedContent);
    validateEmailContent({ subject: `New Challenge: ${challenge.title}`, html: finalHtml });

    return {
      subject: `New Challenge: ${challenge.title}`,
      html: finalHtml
    };
  } catch (error) {
      console.error('Error formatting challenge email:', error);
      // Fallback or rethrow
      throw new Error(`Failed to format challenge email: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function formatFeedbackEmail(
  feedback: Feedback,
  submission: { challengeId: string },
  challenge: Challenge,
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  try {
    const template = await loadAndCompileTemplate('feedback');

    // Prepare data for the template
    const templateData = {
      greeting: getGreeting(emailStyle),
      challenge: challenge,
      feedback: feedback
    };

    const renderedContent = template(templateData);
    const finalHtml = baseTemplateWrapper(renderedContent);
    validateEmailContent({ subject: `Feedback: ${challenge.title}`, html: finalHtml });

    return {
      subject: `Feedback: ${challenge.title}`,
      html: finalHtml
    };
  } catch (error) {
    console.error('Error formatting feedback email:', error);
    throw new Error(`Failed to format feedback email: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function formatDigestEmail(
  digest: Record<string, any>, // Using generic type for now
  emailStyle: EmailStyle
): Promise<{ subject: string; html: string }> {
  // TODO: Refactor using Handlebars template 'digest.hbs'
  // TODO: Define a proper DigestData type in types.ts
  const periodType = digest.type?.charAt(0).toUpperCase() + digest.type?.slice(1) || 'Digest';
  const markdown = `Placeholder for ${periodType} Digest`; // Placeholder
  const markdownToHtml = async (md: string): Promise<string> => `<p>${escapeHtml(md)}</p>`; // Placeholder
  return {
    subject: `${periodType} Progress Digest`,
    html: baseTemplateWrapper(await markdownToHtml(markdown))
  };
}

export async function formatWelcomeEmail(
  config: Config,
  mentorProfile: MentorProfile
): Promise<{ subject: string; html: string }> {
  try {
    const template = await loadAndCompileTemplate('welcome');

    // Determine schedule description
    let scheduleDescription = 'on a schedule you define';
    if (config.schedule.challengeFrequency === 'daily') {
      scheduleDescription = 'on a daily basis';
    } else if (config.schedule.challengeFrequency === 'threePerWeek') {
      scheduleDescription = 'on Mondays, Wednesdays, and Fridays';
    } else if (config.schedule.challengeFrequency === 'weekly') {
      scheduleDescription = 'every Monday';
    } else if (config.schedule.challengeFrequency === 'manual') {
      scheduleDescription = 'manually when you trigger the action';
    }

    // Prepare data for the template
    const templateData = {
      greeting: getGreeting(config.emailStyle),
      learningTopics: Object.keys(config.topics).join(', '),
      scheduleDescription: scheduleDescription,
      mentor: mentorProfile,
      mentorExpertise: mentorProfile.expertise.join(', ')
    };

    const renderedContent = template(templateData);
    const finalHtml = baseTemplateWrapper(renderedContent);
    validateEmailContent({ subject: 'Welcome to TechDeck Academy!', html: finalHtml });

    return {
      subject: 'Welcome to TechDeck Academy!',
      html: finalHtml
    };
  } catch (error) {
    console.error('Error formatting welcome email:', error);
    throw new Error(`Failed to format welcome email: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function formatLetterResponseEmail(
  response: LetterResponse,
  originalQuestion: string,
  emailStyle: EmailStyle,
  mentorName: string
): Promise<{ subject: string; html: string }> {
  try {
    const template = await loadAndCompileTemplate('letter-response');

    // Prepare data for the template
    const templateData = {
      greeting: getGreeting(emailStyle),
      // Extract first line or fixed length for summary
      shortQuestion: originalQuestion.split('\n')[0].substring(0, 75),
      // IMPORTANT: Assuming response.content might contain safe HTML/Markdown
      // If it needs sanitization, do it here before passing to template
      responseContentHtml: response.content, 
      mentorName: mentorName
    };

    const renderedContent = template(templateData);
    const finalHtml = baseTemplateWrapper(renderedContent);
    // Use a slightly more dynamic subject
    const subject = `Re: ${templateData.shortQuestion}`;
    validateEmailContent({ subject: subject, html: finalHtml });

    return {
      subject: subject,
      html: finalHtml
    };
  } catch (error) {
    console.error('Error formatting letter response email:', error);
    throw new Error(`Failed to format letter response email: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateEmailContent(content: { subject: string; html: string }): void {
  if (!content.subject || content.subject.trim() === '') {
    throw new Error('Email subject cannot be empty.')
  }
  if (!content.html || content.html.trim() === '') {
    throw new Error('Email HTML content cannot be empty.')
  }
  // Add more checks if needed (e.g., HTML validity, size limits)
}

// Updated sendEmail function with integrated retry logic
export async function sendEmail(
  config: Config,
  content: { subject: string; html: string },
  maxRetries = 3,
  retryDelay = 1500 // Slightly increased delay
): Promise<void> {
  validateEmailContent(content);

  console.log(`Attempting to send email: "${content.subject}" to ${config.userEmail}`);

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
          const { data, error } = await resend.emails.send({
              from: 'TechDeck Academy <academy@techdeck.life>', // Use a verified domain
              to: config.userEmail,
              subject: content.subject,
              html: content.html,
          });

          if (error) {
              throw error; // Throw Resend error to be caught below
          }

          console.log(`Email sent successfully (ID: ${data?.id}) on attempt ${attempt}.`);
          return; // Success
      } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`Email send attempt ${attempt} failed: ${lastError.message}`);
          if (attempt < maxRetries) {
              // Exponential backoff with jitter
              const delay = retryDelay * Math.pow(2, attempt - 1);
              const jitter = delay * 0.1 * (Math.random() * 2 - 1);
              const effectiveDelay = Math.max(0, Math.round(delay + jitter));
              console.log(`Retrying email send in approximately ${effectiveDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, effectiveDelay));
          } else {
               console.error(`Email send failed after ${maxRetries} attempts.`);
          }
      }
  }
  // If loop finishes, all retries failed
  throw new Error(`Failed to send email after ${maxRetries} attempts: ${lastError?.message || 'Unknown Resend error'}`);
} 