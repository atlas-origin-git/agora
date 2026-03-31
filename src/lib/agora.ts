import Anthropic from '@anthropic-ai/sdk';
import {
  SocratesSystemPrompt,
  OracleSystemPrompt,
  CommentarySystemPrompt,
  SynthesisSystemPrompt,
  OffTopicSystemPrompt,
} from './prompts';

// Auth: supports both OAuth tokens (Max subscription) and API keys
const authToken = process.env.ANTHROPIC_AUTH_TOKEN || '';
const isOAuth = authToken.includes('sk-ant-oat');

const anthropic = new Anthropic({
  ...(isOAuth
    ? {
        apiKey: null as unknown as string,
        authToken,
        defaultHeaders: {
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
          'user-agent': 'claude-cli/2.1.75',
          'x-app': 'cli',
        },
      }
    : {
        apiKey: process.env.ANTHROPIC_API_KEY,
      }),
});

// OAuth requires Claude Code identity prefix in system prompts
function wrapSystem(prompt: string): string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  if (!isOAuth) return prompt;
  return [
    { type: 'text' as const, text: 'You are Claude Code, Anthropic\'s official CLI for Claude.', cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: prompt, cache_control: { type: 'ephemeral' as const } },
  ];
}

export interface DialogueHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionConfig {
  question: string;
  domain: string;
  maxRounds?: number;
  userRedirect?: string | null;
  userContext?: string | null;
  dialogueHistory?: DialogueHistoryEntry[];
}

export type StreamEvent =
  | { type: 'session_started'; data: { sessionId: string; question: string; domain: string; maxRounds: number } }
  | { type: 'socrates_thinking' }
  | { type: 'socrates_delta'; data: { text: string } }
  | { type: 'socrates_complete'; data: { text: string } }
  | { type: 'oracle_thinking' }
  | { type: 'oracle_delta'; data: { text: string } }
  | { type: 'oracle_complete'; data: { text: string } }
  | { type: 'commentary_complete'; data: { text: string; round: number } }
  | { type: 'round_complete'; data: { roundNumber: number } }
  | { type: 'synthesis_thinking' }
  | { type: 'synthesis_delta'; data: { text: string } }
  | { type: 'synthesis_complete'; data: { text: string } }
  | { type: 'session_complete'; data: { synthesis: string; questions: string[] } }
  | { type: 'error'; data: { message: string } };

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

// Stream a message and call onDelta for each text token. Returns the full text.
async function streamMessage(
  params: {
    model: string;
    max_tokens: number;
    system: ReturnType<typeof wrapSystem>;
    messages: { role: 'user' | 'assistant'; content: string }[];
  },
  onDelta: (text: string) => void
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    messages: params.messages,
  });

  let fullText = '';
  stream.on('text', (text) => {
    fullText += text;
    onDelta(text);
  });

  await stream.finalMessage();
  return fullText.trim();
}

export async function callOffTopicCheck(question: string): Promise<{
  isOffTopic: boolean;
  reason?: string;
}> {
  const prompt = OffTopicSystemPrompt;
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: wrapSystem(prompt),
    messages: [{ role: 'user', content: `Question: ${question}` }],
  });

  const textParts = msg.content.filter(b => b.type === 'text').map(b => ('text' in b ? b.text : '')).join('').trim();
  if (textParts.startsWith('OFF_TOPIC:')) {
    return { isOffTopic: true, reason: textParts.replace('OFF_TOPIC:', '').trim() };
  }
  return { isOffTopic: false };
}

export async function runSession(
  config: SessionConfig,
  emit: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const maxRounds = config.maxRounds ?? 5;
  const dialogueHistory: DialogueHistoryEntry[] = config.dialogueHistory ?? [];
  let currentRedirect = config.userRedirect ?? null;
  let currentContext = config.userContext ?? null;
  const socratesQuestions: string[] = [];

  try {
    const startRound = Math.floor(dialogueHistory.length / 2) + 1;

    for (let round = startRound; round <= maxRounds; round++) {
      if (signal?.aborted) {
        emit({ type: 'error', data: { message: 'Session aborted by user' } });
        return;
      }

      const effectiveQuestion = currentRedirect
        ? `${currentRedirect}\n\nPlease reframe your next question around this direction.`
        : config.question;
      currentRedirect = null;

      // --- Socrates ---
      emit({ type: 'socrates_thinking' });

      const socratesPrompt = SocratesSystemPrompt
        .replace('{{USER_QUESTION}}', effectiveQuestion)
        .replace('{{CURRENT_ROUND}}', String(round))
        .replace('{{DIALOGUE_HISTORY}}', buildDialogueHistory(dialogueHistory));

      const socratesMessages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (let i = 0; i < dialogueHistory.length; i += 2) {
        const q = dialogueHistory[i];
        const a = dialogueHistory[i + 1];
        if (q && a) {
          socratesMessages.push({ role: 'assistant', content: q.content });
          socratesMessages.push({ role: 'user', content: `Oracle answered: ${a.content}\n\nNow ask your next question.` });
        }
      }
      socratesMessages.push({
        role: 'user',
        content: socratesMessages.length === 0
          ? `Begin the dialogue about: ${effectiveQuestion}`
          : 'Ask your next question — probe a NEW dimension not yet covered above.',
      });

      const socratesQ = await streamMessage(
        { model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: wrapSystem(socratesPrompt), messages: socratesMessages },
        (delta) => emit({ type: 'socrates_delta', data: { text: delta } })
      );
      emit({ type: 'socrates_complete', data: { text: socratesQ } });
      socratesQuestions.push(socratesQ);

      if (signal?.aborted) return;

      // --- Oracle ---
      emit({ type: 'oracle_thinking' });

      const oraclePrompt = OracleSystemPrompt
        .replace('{{SOCRATES_QUESTION}}', socratesQ)
        .replace('{{USER_QUESTION}}', config.question)
        .replace('{{DIALOGUE_HISTORY}}', buildDialogueHistory(dialogueHistory))
        .replace('{{USER_CONTEXT}}', buildOracleContext(currentContext));
      currentContext = null;

      const oracleMessages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (let i = 0; i < dialogueHistory.length; i += 2) {
        const q = dialogueHistory[i];
        const a = dialogueHistory[i + 1];
        if (q && a) {
          oracleMessages.push({ role: 'user', content: q.content });
          oracleMessages.push({ role: 'assistant', content: a.content });
        }
      }
      oracleMessages.push({ role: 'user', content: socratesQ });

      const oracleA = await streamMessage(
        { model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: wrapSystem(oraclePrompt), messages: oracleMessages },
        (delta) => emit({ type: 'oracle_delta', data: { text: delta } })
      );
      emit({ type: 'oracle_complete', data: { text: oracleA } });

      if (signal?.aborted) return;

      // --- Commentary (lightweight per-round narration) ---
      const commentaryPrompt = CommentarySystemPrompt
        .replace('{{SOCRATES_QUESTION}}', socratesQ)
        .replace('{{ORACLE_ANSWER}}', oracleA)
        .replace('{{USER_QUESTION}}', config.question)
        .replace('{{CURRENT_ROUND}}', String(round))
        .replace('{{MAX_ROUNDS}}', String(maxRounds));

      const commentary = await streamMessage(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: wrapSystem(commentaryPrompt),
          messages: [{ role: 'user', content: `Socrates: ${socratesQ}\n\nOracle: ${oracleA}` }],
        },
        () => {} // don't stream deltas for commentary — it's short enough to send complete
      );
      emit({ type: 'commentary_complete', data: { text: commentary, round } });

      // Accumulate dialogue history
      dialogueHistory.push({ role: 'user', content: socratesQ });
      dialogueHistory.push({ role: 'assistant', content: oracleA });

      emit({ type: 'round_complete', data: { roundNumber: round } });
    }

    // --- Final synthesis: the actual answer to the user's question ---
    let finalSynthesis = '';

    if (dialogueHistory.length >= 2) {
      const allQA = [];
      for (let i = 0; i < dialogueHistory.length; i += 2) {
        if (dialogueHistory[i] && dialogueHistory[i + 1]) {
          allQA.push(`**Round ${Math.floor(i / 2) + 1}**\nQuestion: ${dialogueHistory[i].content}\nAnswer: ${dialogueHistory[i + 1].content}`);
        }
      }
      const combinedDialogue = allQA.join('\n\n---\n\n');

      try {
        emit({ type: 'synthesis_thinking' });

        const finalPrompt = SynthesisSystemPrompt
          .replace('{{USER_QUESTION}}', config.question)
          .replace('{{DIALOGUE}}', combinedDialogue);

        finalSynthesis = await streamMessage(
          {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: wrapSystem(finalPrompt),
            messages: [{ role: 'user', content: `Synthesize the answer to my question: ${config.question}` }],
          },
          (delta) => emit({ type: 'synthesis_delta', data: { text: delta } })
        );
        emit({ type: 'synthesis_complete', data: { text: finalSynthesis } });
      } catch {
        finalSynthesis = `Session explored ${socratesQuestions.length} rounds of dialogue.\n\n${socratesQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
      }
    }

    emit({ type: 'session_complete', data: { synthesis: finalSynthesis, questions: socratesQuestions } });
  } catch (err) {
    emit({ type: 'error', data: { message: err instanceof Error ? err.message : 'Unknown error' } });
  }
}
