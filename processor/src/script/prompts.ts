/**
 * Prompt templates for script generation
 * Targeted at AI engineers and tinkerers audience
 */

import type { NewsletterContent } from '@briefcast/shared';
import { SCRIPT_JSON_SCHEMA_DESCRIPTION } from '@briefcast/shared';

/**
 * System prompt for podcast script generation
 * Defines the personality and output format
 */
export const SCRIPT_SYSTEM_PROMPT = `You are a podcast script writer for "Briefcast", a daily tech podcast for AI engineers, ML practitioners, and curious tinkerers.

## Your Persona
- Technical but accessible
- Genuinely curious and enthusiastic about technical innovations
- Skeptical of hype, focused on practical implications
- Respects your audience's intelligence and time

## Audience Profile
Your listeners are:
- Software engineers building AI/ML systems
- Researchers exploring new techniques
- Tech enthusiasts who tinker with cutting-edge tools
- People who want depth, not just headlines

## Content Guidelines
1. **Depth over breadth**: Better to explain one thing well than skim five topics
2. **Technical accuracy**: Use precise terminology, explain when needed
3. **Practical angles**: "Why does this matter for someone building systems?"
4. **Honest assessment**: Call out hype, acknowledge limitations
5. **Natural flow**: Write for the ear, not the page
6. **No filler**: Every sentence should add value

## Structure Requirements
${SCRIPT_JSON_SCHEMA_DESCRIPTION}

## Writing Style
- Conversational but informed
- Use "we" to include the audience
- Rhetorical questions to engage
- Transitions that create narrative flow
- End topics with implications or questions for exploration
`;

/**
 * Generate user prompt from newsletter content
 */
export function generateUserPrompt(
  contents: NewsletterContent[],
  date: string
): string {
  const sources = contents.map((c, i) => ({
    number: i + 1,
    subject: c.subject,
    from: c.from,
    content: c.cleanedText.substring(0, 5000), // Limit content length
    links: c.links.slice(0, 10), // Limit links
  }));

  const totalWords = contents.reduce((sum, c) => sum + c.wordCount, 0);
  const estimatedTopics = Math.max(2, Math.min(5, Math.floor(totalWords / 500)));

  return `Create a podcast script for ${date} based on these ${contents.length} newsletter(s).

## Source Materials

${sources
  .map(
    (s) => `
### Source ${s.number}: "${s.subject}"
From: ${s.from}

${s.content}

Key links:
${s.links.map((l: { title?: string; url: string }) => `- ${l.title || l.url}`).join('\n')}
`
  )
  .join('\n---\n')}

## Instructions

1. **Analyze** the content for the most interesting and relevant topics for AI engineers
2. **Select** ${estimatedTopics}-${estimatedTopics + 2} topics that have enough substance for deep discussion
3. **Write** a complete podcast script with:
   - Engaging intro that hooks the listener
   - Topic sections that go deep, not wide
   - Synthesis that connects themes and provides takeaways

4. **Duration target**: ${Math.max(5, Math.min(30, Math.floor(totalWords / 150)))} minutes of content

Remember: Your audience are builders. They want to know what things mean for their work, not just what happened.

Output the script as a JSON object following the schema I provided.`;
}

/**
 * Generate a shorter prompt for single-source content
 */
export function generateSingleSourcePrompt(
  content: NewsletterContent,
  date: string
): string {
  return `Create a podcast script for ${date} based on this newsletter.

## Source: "${content.subject}"
From: ${content.from}

${content.cleanedText.substring(0, 8000)}

## Key Links
${content.links.slice(0, 15).map((l: { title?: string; url: string }) => `- ${l.title || l.url}`).join('\n')}

## Instructions

1. Extract 2-4 substantial topics from this content
2. Write a complete podcast script for AI engineers and ML practitioners
3. Focus on technical depth and practical implications
4. Target duration: ${Math.max(5, Math.min(20, Math.floor(content.wordCount / 150)))} minutes

Output the script as a JSON object following the schema I provided.`;
}

/**
 * Generate prompt for light/sparse content
 */
export function generateLightContentPrompt(
  contents: NewsletterContent[],
  date: string
): string {
  const allContent = contents.map((c) => c.cleanedText).join('\n\n---\n\n');

  return `Create a SHORT podcast script for ${date} based on limited content.

## Available Content
${allContent.substring(0, 4000)}

## Instructions

Since content is limited today:
1. Create a brief 3-5 minute episode
2. Focus on 1-2 key insights
3. Be honest that it's a shorter episode
4. Suggest what listeners might explore on their own

Output the script as a JSON object following the schema I provided.`;
}

/**
 * Select appropriate prompt based on content
 */
export function selectPromptStrategy(
  contents: NewsletterContent[],
  date: string
): string {
  const totalWords = contents.reduce((sum, c) => sum + c.wordCount, 0);

  if (contents.length === 1) {
    return generateSingleSourcePrompt(contents[0], date);
  }

  if (totalWords < 500) {
    return generateLightContentPrompt(contents, date);
  }

  return generateUserPrompt(contents, date);
}
