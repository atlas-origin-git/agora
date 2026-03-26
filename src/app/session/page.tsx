'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Message } from '@/types';

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const question = decodeURIComponent(searchParams.get('q') || '');

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSocrates, setCurrentSocrates] = useState('');
  const [currentOracle, setCurrentOracle] = useState('');
  const [synthesisQuickTake, setSynthesisQuickTake] = useState('');
  const [synthesisFull, setSynthesisFull] = useState('');
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState('');
  const [redirectOpen, setRedirectOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [redirectText, setRedirectText] = useState('');
  const [contextText, setContextText] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    quickTake: string;
    synthesis: string;
    questions: string[];
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const dialogueHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roundCompleteCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!question) {
      router.replace('/');
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentSocrates, currentOracle, scrollToBottom]);

  const handleSSEEvent = useCallback(
    (type: string, data: Record<string, unknown>) => {
      switch (type) {
        case 'session_started':
          roundCompleteCountRef.current = 0;
          break;

        case 'socrates_question': {
          setCurrentSocrates(data.text as string);
          setCurrentOracle('');
          break;
        }

        case 'oracle_answer': {
          const answer = data.text as string;
          setCurrentOracle(answer);
          break;
        }

        case 'synthesis_update': {
          const quickTake = (data.quickTake as string) || '';
          const synthesis = (data.synthesis as string) || '';
          setSynthesisQuickTake(quickTake);
          setSynthesisFull(synthesis);

          // Commit current round to messages
          setCurrentSocrates((prevS) => {
            setCurrentOracle((prevO) => {
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
              return prevO;
            });
            return prevS;
          });
          break;
        }

        case 'session_complete': {
          setIsComplete(true);
          setIsEnded(true);
          setSummaryData(data as { quickTake: string; synthesis: string; questions: string[] });
          setShowSummary(true);
          setIsLoading(false);
          break;
        }

        case 'error': {
          setError((data.message as string) || 'Something went wrong.');
          setIsLoading(false);
          break;
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!question) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const start = async () => {
      setIsLoading(true);
      setError('');

      try {
        const res = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            domain: 'ecommerce-pm',
            maxRounds: 5,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Session failed');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        setIsLoading(false);
        setIsPaused(false);

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
            } catch {
              continue;
            }

            handleSSEEvent(eventType, data);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Session failed');
        setIsLoading(false);
      }
    };

    start();

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  const resumeSession = useCallback(
    async (signal: AbortSignal, extra?: { redirect?: string | null; context?: string | null }) => {
      setIsPaused(false);
      setIsLoading(true);
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

        const decoder = new TextDecoder();
        let buffer = '';

        setIsLoading(false);

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
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Resume failed');
        setIsLoading(false);
      }
    },
    [question, handleSSEEvent]
  );

  const handlePause = () => {
    setIsPaused(true);
    abortControllerRef.current?.abort();
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
    setIsLoading(false);
    setShowSummary(true);
  };

  const handleNewSession = () => {
    router.push('/');
  };

  if (!question) return null;

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewSession}
              className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              ← Agora
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
        <div className="max-w-6xl mx-auto h-full flex flex-col md:flex-row gap-0">

          {/* Dialogue Panel */}
          <div className="flex-1 overflow-y-auto px-4 py-6 md:border-r border-[#E5E7EB]">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-4">
              Expert Dialogue
            </h2>

            {/* User question */}
            <div className="mb-6">
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#7C3AED] text-white text-xs font-bold mt-0.5 shrink-0">U</span>
                <div className="bg-[#F3F4F6] rounded-xl rounded-tl-none px-4 py-3 text-sm text-[#111827]">
                  <span className="text-[#9CA3AF] text-xs block mb-1">Your question</span>
                  {question}
                </div>
              </div>
            </div>

            {/* Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="mb-5">
                {msg.role === 'socrates' && (
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#F59E0B] text-white text-xs font-bold mt-0.5 shrink-0">S</span>
                    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl rounded-tl-none px-4 py-3 text-sm text-[#111827]">
                      <span className="text-[#B45309] text-xs font-semibold block mb-1">Socrates asks</span>
                      {msg.content}
                    </div>
                  </div>
                )}
                {msg.role === 'oracle' && (
                  <div className="mb-5 ml-5">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D9488] text-white text-xs font-bold mt-0.5 shrink-0">O</span>
                      <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl rounded-tr-none px-4 py-3 text-sm text-[#111827]">
                        <span className="text-[#0F766E] text-xs font-semibold block mb-1">Oracle answers</span>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* In-progress Socrates */}
            {currentSocrates && (
              <div className="mb-5">
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#F59E0B] text-white text-xs font-bold mt-0.5 shrink-0">S</span>
                  <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl rounded-tl-none px-4 py-3 text-sm text-[#111827]">
                    <span className="text-[#B45309] text-xs font-semibold block mb-1">Socrates asks</span>
                    {currentSocrates}
                    <span className="inline-block ml-2 w-2 h-4 bg-[#F59E0B] animate-pulse rounded" />
                  </div>
                </div>
              </div>
            )}

            {/* In-progress Oracle */}
            {currentOracle && (
              <div className="mb-5 ml-5">
                <div className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D9488] text-white text-xs font-bold mt-0.5 shrink-0">O</span>
                  <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl rounded-tr-none px-4 py-3 text-sm text-[#111827]">
                    <span className="text-[#0F766E] text-xs font-semibold block mb-1">Oracle answers</span>
                    {currentOracle}
                    <span className="inline-block ml-2 w-2 h-4 bg-[#0D9488] animate-pulse rounded" />
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && !currentSocrates && !currentOracle && (
              <div className="flex items-center gap-2 text-sm text-[#9CA3AF]">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h2z" />
                </svg>
                Socrates is thinking...
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
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

            <div ref={messagesEndRef} />
          </div>

          {/* Synthesis Panel */}
          <div className="md:w-[420px] overflow-y-auto px-4 py-6 bg-white">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-4">
              Synthesis
            </h2>

            {/* Quick take */}
            {synthesisQuickTake && (
              <div className="mb-4 p-4 rounded-xl bg-[#F0FDFA] border border-[#99F6E4]">
                <p className="text-sm font-semibold text-[#0F766E] leading-relaxed">
                  {synthesisQuickTake}
                </p>
              </div>
            )}

            {/* Full synthesis */}
            {synthesisFull && (
              <div className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">
                {synthesisFull}
              </div>
            )}

            {/* Empty synthesis */}
            {!synthesisFull && !isLoading && (
              <div className="text-sm text-[#D1D5DB] italic">
                Synthesis will appear after the first round...
              </div>
            )}

            {isLoading && !synthesisFull && (
              <div className="flex items-center gap-2 text-sm text-[#9CA3AF]">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h2z" />
                </svg>
                Synthesizing...
              </div>
            )}

            {/* Summary (session end) */}
            {showSummary && summaryData && (
              <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                <h3 className="text-sm font-semibold text-[#111827] mb-3">Session Summary</h3>
                <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] mb-3">
                  <p className="text-sm font-semibold text-[#92400E]">{summaryData.quickTake}</p>
                </div>
                {summaryData.questions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[#6B7280] mb-2">
                      Questions Agora asked you:
                    </p>
                    <ol className="space-y-2">
                      {summaryData.questions.map((q, i) => (
                        <li key={i} className="flex gap-2 text-sm text-[#374151]">
                          <span className="text-[#F59E0B] font-bold">{i + 1}.</span>
                          {q}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Intervention Bar */}
      {!isEnded && (
        <div className="bg-white border-t border-[#E5E7EB] px-4 py-3">
          <div className="max-w-6xl mx-auto">
            {/* Paused banner */}
            {isPaused && (
              <div className="mb-3 px-4 py-2 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-sm text-[#92400E] text-center">
                ⏸ Session paused — resume when ready
              </div>
            )}

            {/* Main controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Pause/Resume */}
              {!isEnded && (
                <button
                  onClick={isPaused ? handleResume : handlePause}
                  className="px-4 py-2 rounded-lg border border-[#D1D5DB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
                >
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}

              <div className="h-4 w-px bg-[#E5E7EB]" />

              {/* Redirect */}
              <button
                onClick={() => {
                  setRedirectOpen(!redirectOpen);
                  setContextOpen(false);
                }}
                className="px-4 py-2 rounded-lg border border-[#D1D5DB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                ↗ Redirect
              </button>

              {/* Inject Context */}
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

              {/* End Session */}
              <button
                onClick={handleEndSession}
                className="px-4 py-2 rounded-lg border border-[#FECACA] text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                End Session
              </button>
            </div>

            {/* Redirect input */}
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

            {/* Context input */}
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

      {/* Session end - New Session button */}
      {isEnded && (
        <div className="bg-white border-t border-[#E5E7EB] px-4 py-4">
          <div className="max-w-6xl mx-auto">
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
