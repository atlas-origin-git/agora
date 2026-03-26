'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const EXAMPLE_QUESTIONS = [
  'How do I make my products show up higher in search?',
  "What's the difference between a marketplace and a standalone store?",
  'How should I decide what products to list in my catalog?',
];

export default function LandingPage() {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [offTopicError, setOffTopicError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleExampleClick = (eq: string) => {
    setQuestion(eq);
    setError('');
    setOffTopicError('');
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    const trimmed = question.trim();

    if (!trimmed) {
      setError('Please enter a question to get started.');
      return;
    }
    if (trimmed.split(/\s+/).length < 3) {
      setError("That's a bit too short — try asking in a full sentence so Socrates has something to work with.");
      return;
    }

    setError('');
    setOffTopicError('');
    setIsLoading(true);

    try {
      // Off-topic check
      const otRes = await fetch('/api/off-topic-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const otData = await otRes.json();

      if (otData.isOffTopic) {
        setOffTopicError(
          `This question seems outside the E-commerce Product Management domain${otData.reason ? `: ${otData.reason}` : '.'} Try asking about catalog, pricing, search ranking, or fulfillment.`
        );
        setIsLoading(false);
        return;
      }

      // Navigate to session
      const encoded = encodeURIComponent(trimmed);
      router.push(`/session?q=${encoded}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <main className="min-h-screen bg-[#F9FAFB] flex flex-col items-center px-4 py-12">
      {/* Logo */}
      <div className="w-full max-w-2xl mb-2">
        <h1 className="text-4xl font-bold tracking-tight text-[#111827] font-display">
          Agora
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Expert answers start with expert questions.
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 mt-6">
        {/* Domain pill */}
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-medium border border-[#FDE68A]">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
            </svg>
            E-commerce Product Management
          </span>
        </div>

        {/* Question input */}
        <div className="mb-4">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setError('');
              setOffTopicError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about e-commerce product management..."
            rows={5}
            className="w-full resize-none rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 py-3 text-[#111827] placeholder-[#9CA3AF] text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent transition-shadow"
            maxLength={5000}
          />
          <div className="flex justify-end mt-1">
            <span className="text-xs text-[#9CA3AF]">{question.length}/5000</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        {/* Off-topic error */}
        {offTopicError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-sm">
            <p className="font-medium mb-1">Outside this domain</p>
            <p>{offTopicError}</p>
            <p className="mt-2 text-xs text-[#B45309]">Example: &ldquo;How do I improve search ranking for my products?&rdquo;</p>
          </div>
        )}

        {/* Example questions */}
        <div className="mb-6">
          <p className="text-xs text-[#9CA3AF] mb-2">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((eq) => (
              <button
                key={eq}
                onClick={() => handleExampleClick(eq)}
                className="px-3 py-1.5 rounded-full border border-[#D1D5DB] text-xs text-[#374151] hover:border-[#0D9488] hover:text-[#0D9488] transition-colors"
              >
                {eq}
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !question.trim()}
          className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#0D9488] hover:bg-[#0F766E] active:scale-[0.99]"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 00-10 10h2z" />
              </svg>
              Checking topic...
            </span>
          ) : (
            'Start Session →'
          )}
        </button>

        <p className="text-center text-xs text-[#9CA3AF] mt-3">
          ⌘ + Enter to submit
        </p>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center">
        <p className="text-xs text-[#9CA3AF]">
          Agora &mdash; Expert Proxy Platform
        </p>
        <p className="text-xs text-[#D1D5DB] mt-1">
          5-round expert dialogue &bull; E-commerce Product Management
        </p>
      </footer>
    </main>
  );
}
