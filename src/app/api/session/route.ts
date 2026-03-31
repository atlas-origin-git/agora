import { NextRequest, NextResponse } from 'next/server';
import { runSession, DialogueHistoryEntry, StreamEvent } from '@/lib/agora';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await req.json();
    const {
      question,
      domain = 'ecommerce-pm',
      maxRounds = 5,
      userRedirect = null,
      userContext = null,
      dialogueHistory = [],
    } = body;

    // Validation
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question required' }, { status: 400 });
    }
    if (question.trim().length < 5) {
      return NextResponse.json({
        error: 'Question too short — try asking in a full sentence so Socrates has something to work with.',
      }, { status: 400 });
    }
    if (question.trim().length > 5000) {
      return NextResponse.json({
        error: 'Question too long — please keep it under 5,000 characters.',
      }, { status: 400 });
    }

    const sessionId = `agora-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (eventType: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        const emit = (event: StreamEvent) => {
          if ('data' in event) {
            send(event.type, event.data);
          } else {
            send(event.type, {});
          }
        };

        try {
          emit({ type: 'session_started', data: { sessionId, question, domain, maxRounds } });

          await runSession(
            {
              question: question.trim(),
              domain,
              maxRounds,
              userRedirect,
              userContext,
              dialogueHistory: dialogueHistory as DialogueHistoryEntry[],
            },
            emit
          );

          controller.close();
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'Session failed' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('[session POST]', err);
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
  }
}
