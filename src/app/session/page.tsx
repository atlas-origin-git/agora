'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Markdown from 'react-markdown';
import { Message } from '@/types';

type Phase =
  | 'idle'
  | 'socrates_thinking'
  | 'socrates_streaming'
  | 'oracle_thinking'
  | 'oracle_streaming'
  | 'synthesis_thinking'
  | 'synthesis_streaming';

function ThinkingDots({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color }}>
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: color, animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: color, animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: color, animationDelay: '300ms' }} />
      </span>
      {label}
    </div>
  );
}

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const question = decodeURIComponent(searchParams.get('q') || '');

  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [streamingSocrates, setStreamingSocrates] = useState('');
  const [streamingOracle, setStreamingOracle] = useState('');
  const [commentaries, setCommentaries] = useState<{ round: number; text: string }[]>([]);
  const [streamingSynthesis, setStreamingSynthesis] = useState('');
  const [finalSynthesis, setFinalSynthesis] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds] = useState(5);
  const [isPaused, setIsPaused] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [error, setError] = useState('');
  const [redirectOpen, setRedirectOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [redirectText, setRedirectText] = useState('');
  const [contextText, setContextText] = useState('');
  const [summaryQuestions, setSummaryQuestions] = useState<string[]>([]);
  const [debatePanelOpen, setDebatePanelOpen] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const dialogueHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const mainEndRef = useRef<HTMLDivElement>(null);
  const debateEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const roundCompleteCountRef = useRef(0);
  const streamingSocratesRef = useRef('');
  const streamingOracleRef = useRef('');

  const scrollMain = useCallback(() => {
    mainEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollDebate = useCallback(() => {
    debateEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!question) {
      router.replace('/');
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  useEffect(() => {
    scrollMain();
  }, [finalSynthesis, streamingSynthesis, commentaries, phase, scrollMain]);

  useEffect(() => {
    scrollDebate();
  }, [messages, streamingSocrates, streamingOracle, phase, scrollDebate]);

  const handleSSEEvent = useCallback(
    (type: string, data: Record<string, unknown>) => {
      switch (type) {
        case 'session_started':
          roundCompleteCountRef.current = 0;
          break;

        case 'socrates_thinking':
          streamingSocratesRef.current = '';
          setStreamingSocrates('');
          setStreamingOracle('');
          setPhase('socrates_thinking');
          break;

        case 'socrates_delta': {
          streamingSocratesRef.current += data.text as string;
          setStreamingSocrates(streamingSocratesRef.current);
          setPhase('socrates_streaming');
          break;
        }

        case 'socrates_complete':
          streamingSocratesRef.current = data.text as string;
          setStreamingSocrates(data.text as string);
          break;

        case 'oracle_thinking':
          streamingOracleRef.current = '';
          setStreamingOracle('');
          setPhase('oracle_thinking');
          break;

        case 'oracle_delta': {
          streamingOracleRef.current += data.text as string;
          setStreamingOracle(streamingOracleRef.current);
          setPhase('oracle_streaming');
          break;
        }

        case 'oracle_complete':
          streamingOracleRef.current = data.text as string;
          setStreamingOracle(data.text as string);
          break;

        case 'commentary_complete': {
          const text = (data.text as string) || '';
          const round = (data.round as number) || 0;
          setCommentaries((prev) => [...prev, { round, text }]);
          break;
        }

        case 'synthesis_thinking':
          setIsSynthesizing(true);
          setStreamingSynthesis('');
          setPhase('synthesis_thinking');
          break;

        case 'synthesis_delta':
          setStreamingSynthesis((prev) => prev + (data.text as string));
          setPhase('synthesis_streaming');
          break;

        case 'synthesis_complete': {
          const synthesis = (data.text as string) || '';
          setFinalSynthesis(synthesis);
          setStreamingSynthesis('');
          setIsSynthesizing(false);
          break;
        }

        case 'round_complete': {
          const prevS = streamingSocratesRef.current;
          const prevO = streamingOracleRef.current;
          if (prevS && prevO) {
            dialogueHistoryRef.current.push({ role: 'user', content: prevS });
            dialogueHistoryRef.current.push({ role: 'assistant', content: prevO });
            roundCompleteCountRef.current += 1;
            setCurrentRound(roundCompleteCountRef.current);
            const socratesMsg: Message = {
              id: `socrates-${Date.now()}`,
              role: 'socrates',
              content: prevS,
              timestamp: Date.now(),
              round: roundCompleteCountRef.current,
            };
            const oracleMsg: Message = {
              id: `oracle-${Date.now()}`,
              role: 'oracle',
              content: prevO,
              timestamp: Date.now() + 1,
              round: roundCompleteCountRef.current,
            };
            setMessages((prevMsgs) => [...prevMsgs, socratesMsg, oracleMsg]);
          }

          streamingSocratesRef.current = '';
          streamingOracleRef.current = '';
          setStreamingSocrates('');
          setStreamingOracle('');
          setPhase('idle');
          break;
        }

        case 'session_complete':
          setIsEnded(true);
          setSummaryQuestions((data as { questions: string[] }).questions || []);
          setPhase('idle');
          break;

        case 'error':
          setError((data.message as string) || 'Something went wrong.');
          setPhase('idle');
          break;
      }
    },
    []
  );

  const processSSEStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim() || !line.startsWith('event:')) continue;
          const eventType = line.replace('event:', '').trim();
          const dataLine = lines[i + 1];
          if (!dataLine?.startsWith('data:')) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.replace('data:', '').trim());
          } catch { continue; }
          handleSSEEvent(eventType, data);
        }
      }
    },
    [handleSSEEvent]
  );

  useEffect(() => {
    if (!question) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const start = async () => {
      setPhase('socrates_thinking');
      setError('');

      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, domain: 'ecommerce-pm', maxRounds: 5 }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Session failed');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        await processSSEStream(reader);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Session failed');
        setPhase('idle');
      }
    };

    start();
    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  const resumeSession = useCallback(
    async (signal: AbortSignal, extra?: { redirect?: string | null; context?: string | null }) => {
      setIsPaused(false);
      setPhase('socrates_thinking');
      setError('');

      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            domain: 'ecommerce-pm',
            maxRounds: 5,
            userRedirect: extra?.redirect ?? null,
            userContext: extra?.context ?? null,
            dialogueHistory: dialogueHistoryRef.current,
          }),
          signal,
        });

        if (!res.ok) throw new Error('Resume failed');
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        await processSSEStream(reader);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Resume failed');
        setPhase('idle');
      }
    },
    [question, processSSEStream]
  );

  const handlePause = () => {
    setIsPaused(true);
    abortControllerRef.current?.abort();
    setPhase('idle');
  };

  const handleResume = () => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    resumeSession(controller.signal);
  };

  const handleRedirect = () => {
    if (!redirectText.trim()) return;
    setRedirectText('');
    setRedirectOpen(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    resumeSession(controller.signal, { redirect: redirectText.trim() });
  };

  const handleInjectContext = () => {
    if (!contextText.trim()) return;
    setContextText('');
    setContextOpen(false);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    resumeSession(controller.signal, { context: contextText.trim() });
  };

  const handleEndSession = () => {
    abortControllerRef.current?.abort();
    setIsEnded(true);
    setPhase('idle');

    setMessages((currentMessages) => {
      const socratesQs = currentMessages
        .filter((m) => m.role === 'socrates')
        .map((m) => m.content);
      setSummaryQuestions(socratesQs);
      return currentMessages;
    });
  };

  const handleNewSession = () => {
    router.push('/');
  };

  if (!question) return null;

  const isActive = phase !== 'idle';

  // Group messages into rounds for the debate panel
  const rounds: { round: number; socrates: Message; oracle: Message }[] = [];
  for (let i = 0; i < messages.length; i += 2) {
    const s = messages[i];
    const o = messages[i + 1];
    if (s && o && s.role === 'socrates' && o.role === 'oracle') {
      rounds.push({ round: s.round || Math.floor(i / 2) + 1, socrates: s, oracle: o });
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewSession}
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              &larr; Agora
            </button>
            <span className="text-[#D1D5DB]">|</span>
            <span className="text-xs text-[#9CA3AF] max-w-xs truncate">
              {question.slice(0, 60)}{question.length > 60 ? '...' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!isEnded && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#374151]">
                  Round {Math.max(1, currentRound)} of {totalRounds}
                </span>
                <div className="w-24 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0D9488] rounded-full transition-all"
                    style={{ width: `${(currentRound / totalRounds) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={() => setDebatePanelOpen(!debatePanelOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D1D5DB] text-xs font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              title={debatePanelOpen ? 'Hide expert debate' : 'Show expert debate'}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {debatePanelOpen ? 'Hide Debate' : 'Show Debate'}
            </button>
            {!isEnded && (
              <button
                onClick={handleEndSession}
                className="text-xs text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
              >
                End Session
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex">

          {/* === Main Panel: Question + Commentaries + Synthesis === */}
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="max-w-3xl mx-auto">
              {/* User question */}
              <div className="mb-8">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#7C3AED] text-white text-sm font-bold shrink-0">U</span>
                  <div>
                    <span className="text-xs font-medium text-[#9CA3AF] block mb-1">Your question</span>
                    <p className="text-lg text-[#111827] leading-relaxed">{question}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E5E7EB] mb-8" />

              {/* Per-round commentaries */}
              {commentaries.length > 0 && (
                <div className="mb-8 space-y-4">
                  {commentaries.map((c, i) => (
                    <div key={i} className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider block mb-2">
                        Round {c.round} insight
                      </span>
                      <div className="text-sm text-[#374151] leading-relaxed prose prose-sm max-w-none">
                        <Markdown>{c.text}</Markdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Answer section */}
              <div>
                <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-5">
                  {finalSynthesis || streamingSynthesis || isSynthesizing ? 'Your Answer' : 'Answer'}
                </h2>

                {/* Waiting state */}
                {!finalSynthesis && !streamingSynthesis && !isSynthesizing && !isEnded && (
                  <div className="flex items-center gap-3 text-sm text-[#9CA3AF]">
                    {isActive ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
                        <span>Experts are deliberating — the answer will appear once the dialogue completes...</span>
                      </>
                    ) : (
                      <span className="italic">The answer to your question will appear here once the expert dialogue completes.</span>
                    )}
                  </div>
                )}

                {/* Synthesis thinking */}
                {isSynthesizing && !streamingSynthesis && (
                  <div className="mb-4">
                    <ThinkingDots label="Writing your answer..." color="#7C3AED" />
                  </div>
                )}

                {/* Synthesis streaming */}
                {streamingSynthesis && (
                  <div className="text-sm text-[#374151] leading-relaxed">
                    <div className="prose prose-sm max-w-none"><Markdown>{streamingSynthesis}</Markdown></div>
                    <span className="inline-block w-2 h-4 bg-[#7C3AED] animate-pulse rounded ml-0.5" />
                  </div>
                )}

                {/* Final answer */}
                {finalSynthesis && !streamingSynthesis && (
                  <div className="text-sm text-[#374151] leading-relaxed">
                    <div className="prose prose-sm max-w-none"><Markdown>{finalSynthesis}</Markdown></div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
                    {error}
                    <button
                      onClick={() => {
                        setError('');
                        const controller = new AbortController();
                        abortControllerRef.current = controller;
                        resumeSession(controller.signal);
                      }}
                      className="ml-3 underline text-xs"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Early end — no synthesis */}
                {isEnded && !finalSynthesis && !streamingSynthesis && !isSynthesizing && summaryQuestions.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-[#6B7280] mb-3">
                      Session ended early. Here are the questions that were explored:
                    </p>
                    <ol className="space-y-2">
                      {summaryQuestions.map((q, i) => (
                        <li key={i} className="flex gap-2 text-sm text-[#374151]">
                          <span className="text-[#F59E0B] font-bold shrink-0">{i + 1}.</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div ref={mainEndRef} />
              </div>
            </div>
          </div>

          {/* === Debate Side Panel (collapsible) === */}
          <div
            className={`
              border-l border-[#E5E7EB] bg-white overflow-hidden
              transition-all duration-300 ease-in-out
              ${debatePanelOpen ? 'w-[440px] min-w-[440px]' : 'w-0 min-w-0'}
            `}
          >
            <div className="w-[440px] h-full flex flex-col">
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between shrink-0">
                <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
                  Expert Debate
                </h2>
                {rounds.length > 0 && (
                  <span className="text-xs text-[#9CA3AF]">
                    {rounds.length} round{rounds.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Debate messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
                {/* Completed rounds */}
                {rounds.map((r) => (
                  <div key={r.round}>
                    {/* Round divider */}
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                      <span className="text-[10px] font-medium text-[#9CA3AF] uppercase">Round {r.round}</span>
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                    </div>

                    {/* Socrates — left aligned */}
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[85%]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold">S</span>
                          <span className="text-[10px] font-semibold text-[#B45309]">Socrates</span>
                        </div>
                        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl rounded-tl-none px-3 py-2.5 text-sm text-[#111827]">
                          <div className="prose prose-sm max-w-none"><Markdown>{r.socrates.content}</Markdown></div>
                        </div>
                      </div>
                    </div>

                    {/* Oracle — right aligned */}
                    <div className="flex justify-end mb-3">
                      <div className="max-w-[85%]">
                        <div className="flex items-center justify-end gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-[#0F766E]">Oracle</span>
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#0D9488] text-white text-[10px] font-bold">O</span>
                        </div>
                        <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl rounded-tr-none px-3 py-2.5 text-sm text-[#111827]">
                          <div className="prose prose-sm max-w-none"><Markdown>{r.oracle.content}</Markdown></div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Streaming: Socrates thinking */}
                {phase === 'socrates_thinking' && (
                  <div>
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                      <span className="text-[10px] font-medium text-[#9CA3AF] uppercase">Round {currentRound + 1}</span>
                      <div className="flex-1 h-px bg-[#E5E7EB]" />
                    </div>
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[85%]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold">S</span>
                          <span className="text-[10px] font-semibold text-[#B45309]">Socrates</span>
                        </div>
                        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl rounded-tl-none px-3 py-2.5">
                          <ThinkingDots label="Thinking..." color="#D97706" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming: Socrates text */}
                {(phase === 'socrates_streaming' || (streamingSocrates && phase !== 'socrates_thinking' && phase !== 'idle' && !messages.find(m => m.content === streamingSocrates))) && streamingSocrates && (
                  <div>
                    {phase === 'socrates_streaming' && rounds.length > 0 && !messages.find(m => m.content === streamingSocrates) && (
                      <div className="flex items-center gap-2 my-3">
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                        <span className="text-[10px] font-medium text-[#9CA3AF] uppercase">Round {currentRound + 1}</span>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>
                    )}
                    <div className="flex justify-start mb-3">
                      <div className="max-w-[85%]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[10px] font-bold">S</span>
                          <span className="text-[10px] font-semibold text-[#B45309]">Socrates</span>
                        </div>
                        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl rounded-tl-none px-3 py-2.5 text-sm text-[#111827]">
                          <div className="prose prose-sm max-w-none"><Markdown>{streamingSocrates}</Markdown></div>
                          {phase === 'socrates_streaming' && (
                            <span className="inline-block w-2 h-4 bg-[#F59E0B] animate-pulse rounded ml-0.5" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming: Oracle thinking */}
                {phase === 'oracle_thinking' && (
                  <div className="flex justify-end mb-3">
                    <div className="max-w-[85%]">
                      <div className="flex items-center justify-end gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold text-[#0F766E]">Oracle</span>
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#0D9488] text-white text-[10px] font-bold">O</span>
                      </div>
                      <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl rounded-tr-none px-3 py-2.5">
                        <ThinkingDots label="Thinking..." color="#0D9488" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming: Oracle text */}
                {(phase === 'oracle_streaming' || (streamingOracle && phase !== 'oracle_thinking' && phase !== 'idle')) && streamingOracle && (
                  <div className="flex justify-end mb-3">
                    <div className="max-w-[85%]">
                      <div className="flex items-center justify-end gap-1.5 mb-1">
                        <span className="text-[10px] font-semibold text-[#0F766E]">Oracle</span>
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#0D9488] text-white text-[10px] font-bold">O</span>
                      </div>
                      <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl rounded-tr-none px-3 py-2.5 text-sm text-[#111827]">
                        <div className="prose prose-sm max-w-none"><Markdown>{streamingOracle}</Markdown></div>
                        {phase === 'oracle_streaming' && (
                          <span className="inline-block w-2 h-4 bg-[#0D9488] animate-pulse rounded ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {rounds.length === 0 && !isActive && !streamingSocrates && !streamingOracle && (
                  <div className="flex items-center justify-center h-32 text-sm text-[#D1D5DB] italic">
                    The expert debate will appear here...
                  </div>
                )}

                <div ref={debateEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Intervention Bar */}
      {!isEnded && (
        <div className="bg-white border-t border-[#E5E7EB] px-4 py-3">
          <div className="max-w-7xl mx-auto">
            {isPaused && (
              <div className="mb-3 px-4 py-2 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-sm text-[#92400E] text-center">
                Session paused — resume when ready
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!isEnded && (
                <button
                  onClick={isPaused ? handleResume : handlePause}
                  className="px-4 py-2 rounded-lg border border-[#D1D5DB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              )}

              <div className="h-4 w-px bg-[#E5E7EB]" />

              <button
                onClick={() => {
                  setRedirectOpen(!redirectOpen);
                  setContextOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-[#D1D5DB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                Redirect
              </button>

              <button
                onClick={() => {
                  setContextOpen(!contextOpen);
                  setRedirectOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-[#D1D5DB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                + Context
              </button>

              <div className="h-4 w-px bg-[#E5E7EB]" />

              <button
                onClick={handleEndSession}
                className="px-4 py-2 rounded-lg border border-[#FECACA] text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                End Session
              </button>
            </div>

            {redirectOpen && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={redirectText}
                  onChange={(e) => setRedirectText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRedirect()}
                  placeholder="Redirect Socrates's next question (e.g., 'focus on pricing strategy')..."
                  className="flex-1 px-3 py-2 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] text-sm text-[#111827] placeholder-[#D97706] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
                />
                <button
                  onClick={handleRedirect}
                  disabled={!redirectText.trim()}
                  className="px-4 py-2 rounded-lg bg-[#F59E0B] text-white text-sm font-medium hover:bg-[#D97706] disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
              </div>
            )}

            {contextOpen && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={contextText}
                  onChange={(e) => setContextText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInjectContext()}
                  placeholder="Inject context for Oracle (e.g., 'We're a marketplace with 200 sellers')..."
                  className="flex-1 px-3 py-2 rounded-lg border border-[#7C3AED] bg-[#F5F3FF] text-sm text-[#111827] placeholder-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                />
                <button
                  onClick={handleInjectContext}
                  disabled={!contextText.trim()}
                  className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-sm font-medium hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session end */}
      {isEnded && (
        <div className="bg-white border-t border-[#E5E7EB] px-4 py-4">
          <div className="max-w-7xl mx-auto">
            <button
              onClick={handleNewSession}
              className="w-full py-3.5 rounded-xl font-semibold text-white text-sm bg-[#0D9488] hover:bg-[#0F766E] transition-colors"
            >
              New Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-[#F9FAFB]">
        <div className="text-sm text-[#9CA3AF]">Loading session...</div>
      </div>
    }>
      <SessionContent />
    </Suspense>
  );
}
