import Anthropic from '@anthropic-ai/sdk';
import {
  SocratesSystemPrompt,
  OracleSystemPrompt,
  SynthesisSystemPrompt,
  OffTopicSystemPrompt,
} from './prompts';

const anthropic = new Anthropic({
  authToken: process.env.ANTHROPIC_AUTH_TOKEN,
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
// Priority: text blocks first, then extract from thinking blocks
function extractText(content: { type: string; text?: string; thinking?: string }[]): string {
  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      const text = (block.text || '').trim();
      if (text) textParts.push(text);
    } else if (block.type === 'thinking') {
      const thinking = (block.thinking || '').trim();
      if (thinking) thinkingParts.push(thinking);
    }
  }

  // If we have text blocks, return them (text blocks are the actual synthesized answer)
  if (textParts.length > 0) {
    return textParts.join('\n').trim();
  }

  // Fallback: extract from thinking blocks
  // For questions: find the last sentence that ends with ? and is < 250 chars
  const thinking = thinkingParts.join('\n');
  const sentences = thinking.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const question = sentences.reverse().find(s => s.trim().endsWith('?') && s.trim().length < 250);
  if (question) {
    return question.trim();
  }
  return thinking.slice(-300).trim();
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
    // Calculate start round from existing dialogue history (Bug 2: resume replays all rounds)
    const startRound = Math.floor(dialogueHistory.length / 2) + 1;

    for (let round = startRound; round <= maxRounds; round++) {
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

    // Session complete — generate a real final synthesis from the full dialogue
    let finalQuickTake = 'The dialogue has concluded.';
    let finalSynthesis = '';

    if (dialogueHistory.length >= 2) {
      // Build a combined Q&A summary for the synthesis call
      const allQA = [];
      for (let i = 0; i < dialogueHistory.length; i += 2) {
        if (dialogueHistory[i] && dialogueHistory[i + 1]) {
          allQA.push(`Q: ${dialogueHistory[i].content}\nA: ${dialogueHistory[i + 1].content}`);
        }
      }
      const combinedDialogue = allQA.join('\n\n');

      try {
        const { synthesis, quickTake } = await callSynthesis(
          `Final synthesis of the complete dialogue:\n${combinedDialogue}`,
          `This is the final summary of ${socratesQuestions.length} rounds of Socratic dialogue about: ${config.question}`,
          config.question
        );
        finalQuickTake = quickTake;
        finalSynthesis = synthesis;
      } catch {
        // Fallback if synthesis call fails
        finalSynthesis = `Session explored ${socratesQuestions.length} rounds of dialogue.\n\n${socratesQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
      }
    }

    await onComplete({
      quickTake: finalQuickTake,
      synthesis: finalSynthesis,
      questions: socratesQuestions,
    });
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Unknown error');
  }
}
