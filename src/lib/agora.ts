import Anthropic from '@anthropic-ai/sdk';
import {
  SocratesSystemPrompt,
  OracleSystemPrompt,
  SynthesisSystemPrompt,
  OffTopicSystemPrompt,
} from './prompts';

const anthropic = new Anthropic({
  baseURL: 'https://api.minimax.io/anthropic',
  authToken: process.env.ANTHROPIC_API_KEY,
});

export interface DialogueHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface RoundResult {
  socratesQuestion: string;
  oracleAnswer: string;
  synthesisUpdate: string;
  quickTake: string;
}

export interface SessionConfig {
  question: string;
  domain: string;
  maxRounds?: number;
  userRedirect?: string | null;
  userContext?: string | null;
  dialogueHistory?: DialogueHistoryEntry[];
}

// Extract text from API response, handling thinking blocks (MiniMax returns thinking blocks)
// For Socrates: extract the actual question from the thinking content
// For Oracle: extract the substantive answer
function extractText(content: { type: string; text?: string; thinking?: string }[]): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text || '');
    } else if (block.type === 'thinking') {
      const thinking = block.thinking || '';
      // For questions: find the last line that looks like a direct question (short line ending in ?)
      const lines = thinking.split('\n').map(s => s.trim()).filter(Boolean);
      // Look for a line that is a direct question (short, ends with ?, no long leading whitespace)
      const questionLine = lines.reverse().find(line =>
        line.length < 200 && line.endsWith('?') && !line.startsWith('#')
      );
      if (questionLine) {
        parts.push(questionLine);
      } else {
        // Fallback: find last sentence ending in ? within a reasonable char limit
        const lastQIdx = thinking.lastIndexOf('?');
        if (lastQIdx > 0) {
          // Get ~200 chars before the ?
          const start = Math.max(0, lastQIdx - 200);
          const excerpt = thinking.slice(start, lastQIdx + 1).trim();
          parts.push(excerpt);
        } else {
          parts.push(thinking.slice(-500));
        }
      }
    }
  }
  return parts.join('\n').trim();
}

function buildDialogueHistory(history: DialogueHistoryEntry[]): string {
  if (history.length === 0) return 'No previous exchanges.';
  return history
    .map((entry, i) => `[Exchange ${i + 1}]\n${entry.role === 'user' ? 'Socrates asked: ' : 'Oracle answered: '}${entry.content}`)
    .join('\n\n');
}

function buildOracleContext(userContext: string | null | undefined): string {
  if (!userContext) return '';
  return `\n\nAdditional user context to incorporate:\n${userContext}`;
}

export async function callSocrates(
  question: string,
  dialogueHistory: DialogueHistoryEntry[],
  currentRound: number
): Promise<string> {
  const prompt = SocratesSystemPrompt
    .replace('{{USER_QUESTION}}', question)
    .replace('{{CURRENT_ROUND}}', String(currentRound))
    .replace('{{DIALOGUE_HISTORY}}', buildDialogueHistory(dialogueHistory));

  const msg = await anthropic.messages.create({
    model: 'opus-4-5',
    max_tokens: 1024,
    system: prompt,
    messages: [{ role: 'user', content: 'Begin the dialogue.' }],
  });

  return extractText(msg.content);
}

export async function callOracle(
  socratesQuestion: string,
  userQuestion: string,
  dialogueHistory: DialogueHistoryEntry[],
  userContext: string | null | undefined,
  currentRound: number
): Promise<string> {
  const historyText = buildDialogueHistory(dialogueHistory);
  const contextText = buildOracleContext(userContext);

  const prompt = OracleSystemPrompt
    .replace('{{SOCRATES_QUESTION}}', socratesQuestion)
    .replace('{{USER_QUESTION}}', userQuestion)
    .replace('{{DIALOGUE_HISTORY}}', historyText)
    .replace('{{USER_CONTEXT}}', contextText);

  const msg = await anthropic.messages.create({
    model: 'sonnet-4-7-20250611',
    max_tokens: 1024,
    system: prompt,
    messages: [{ role: 'user', content: socratesQuestion }],
  });

  return extractText(msg.content);
}

export async function callSynthesis(
  socratesQuestion: string,
  oracleAnswer: string,
  userQuestion: string
): Promise<{ synthesis: string; quickTake: string }> {
  const prompt = SynthesisSystemPrompt
    .replace('{{SOCRATES_QUESTION}}', socratesQuestion)
    .replace('{{ORACLE_ANSWER}}', oracleAnswer)
    .replace('{{USER_QUESTION}}', userQuestion);

  const msg = await anthropic.messages.create({
    model: 'haiku-4-20250611',
    max_tokens: 1024,
    system: prompt,
    messages: [{ role: 'user', content: `Socrates: ${socratesQuestion}\n\nOracle: ${oracleAnswer}` }],
  });

  const raw = extractText(msg.content);

  // Parse quick take from synthesis
  const quickTakeMatch = raw.match(/QUICK_TAKE:\s*(.+?)(?:\n---|\nSYNTHESIS:|$)/i);
  const synthesisMatch = raw.match(/SYNTHESIS:[\s\n]*(What's happening:.+)/i);

  const quickTake = quickTakeMatch ? quickTakeMatch[1].trim() : raw.slice(0, 120) + '...';
  const synthesis = synthesisMatch ? synthesisMatch[1].trim() : raw;

  return { synthesis, quickTake };
}

export async function callOffTopicCheck(question: string): Promise<{
  isOffTopic: boolean;
  reason?: string;
}> {
  const prompt = OffTopicSystemPrompt;
  const msg = await anthropic.messages.create({
    model: 'haiku-4-20250611',
    max_tokens: 256,
    system: prompt,
    messages: [{ role: 'user', content: `Question: ${question}` }],
  });

  const raw = extractText(msg.content).trim();

  if (raw.startsWith('OFF_TOPIC:')) {
    return { isOffTopic: true, reason: raw.replace('OFF_TOPIC:', '').trim() };
  }
  return { isOffTopic: false };
}

export async function runSession(
  config: SessionConfig,
  onRound: (round: RoundResult) => Promise<void>,
  onComplete: (summary: { quickTake: string; synthesis: string; questions: string[] }) => Promise<void>,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const maxRounds = config.maxRounds ?? 5;
  const dialogueHistory: DialogueHistoryEntry[] = config.dialogueHistory ?? [];
  let currentRedirect = config.userRedirect ?? null;
  let currentContext = config.userContext ?? null;
  const socratesQuestions: string[] = [];

  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (signal?.aborted) {
        onError('Session aborted by user');
        return;
      }

      // Build effective question — prepend redirect if any
      const effectiveQuestion = currentRedirect
        ? `${currentRedirect}\n\nPlease reframe your next question around this direction.`
        : config.question;
      currentRedirect = null;

      // Socrates asks
      const socratesQ = await callSocrates(
        effectiveQuestion,
        dialogueHistory,
        round
      );
      socratesQuestions.push(socratesQ);

      if (signal?.aborted) return;

      // Oracle answers
      const oracleA = await callOracle(
        socratesQ,
        config.question,
        dialogueHistory,
        currentContext,
        round
      );
      currentContext = null;

      if (signal?.aborted) return;

      // Synthesis
      const { synthesis, quickTake } = await callSynthesis(
        socratesQ,
        oracleA,
        config.question
      );

      // Accumulate dialogue history
      dialogueHistory.push({ role: 'user', content: socratesQ });
      dialogueHistory.push({ role: 'assistant', content: oracleA });

      const roundResult: RoundResult = {
        socratesQuestion: socratesQ,
        oracleAnswer: oracleA,
        synthesisUpdate: synthesis,
        quickTake,
      };

      await onRound(roundResult);
    }

    // Session complete
    const finalSynthesis = socratesQuestions.length > 0
      ? dialogueHistory.map(e => e.content).join('\n\n')
      : '';

    await onComplete({
      quickTake: 'The dialogue has concluded — review the synthesis panel for the full picture.',
      synthesis: `Session Summary:\n\nKey questions explored:\n${socratesQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nFull dialogue available in the session history above.`,
      questions: socratesQuestions,
    });
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
