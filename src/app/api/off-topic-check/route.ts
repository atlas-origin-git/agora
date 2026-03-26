import { NextRequest, NextResponse } from 'next/server';
import { callOffTopicCheck } from '@/lib/agora';

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question required' }, { status: 400 });
    }

    if (question.trim().length < 10) {
      return NextResponse.json({
        isOffTopic: true,
        reason: 'Question is too short to evaluate meaningfully.',
      });
    }

    const result = await callOffTopicCheck(question);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[off-topic-check]', err);
    return NextResponse.json({ error: 'Check failed' }, { status: 500 });
  }
}
