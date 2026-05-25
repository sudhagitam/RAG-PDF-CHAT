import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { embedText } from '@/lib/embeddings';
import { getQdrantClient, COLLECTION } from '@/lib/qdrant';
import { getGroq, GROQ_MODELS, SYSTEM_PROMPT } from '@/lib/groq';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOP_K = 6;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { question, sessionId, model = 'best' } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Resolve or create chat session
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    }
    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          id: uuidv4(),
          userId,
          title: question.slice(0, 60),
        },
      });
    }

    // 1. Embed the query
    const queryVector = await embedText(question);

    // 2. Retrieve from Qdrant (user-scoped)
    const qdrant = getQdrantClient();
    const hits = await qdrant.search(COLLECTION, {
      vector: queryVector,
      limit: TOP_K,
      filter: {
        must: [{ key: 'user_id', match: { value: userId } }],
      },
      with_payload: true,
      score_threshold: 0.35,
    });

    const sources = hits.map((h) => ({
      filename: h.payload?.filename as string,
      page: h.payload?.page as number,
      chunkText: h.payload?.chunk_text as string,
      score: h.score,
    }));

    const context = sources
      .map((s) => `[${s.filename}, page ${s.page}]\n${s.chunkText}`)
      .join('\n\n---\n\n');

    // 3. Stream from Groq
    const groq = getGroq();
    const modelId = GROQ_MODELS[model as keyof typeof GROQ_MODELS] ?? GROQ_MODELS.best;

    const encoder = new TextEncoder();
    let fullAnswer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const groqStream = await groq.chat.completions.create({
            model: modelId,
            stream: true,
            max_tokens: 1024,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: context
                  ? `Context from uploaded documents:\n\n${context}\n\n---\n\nQuestion: ${question}`
                  : `No documents found. Question: ${question}`,
              },
            ],
          });

          // Stream session ID first so client can track it
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'session', sessionId: session!.id })}\n\n`)
          );

          for await (const chunk of groqStream) {
            const token = chunk.choices[0]?.delta?.content ?? '';
            if (token) {
              fullAnswer += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`)
              );
            }
          }

          // Send sources at the end
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)
          );

          // Persist Q+A to DB
          await prisma.chatMessage.createMany({
            data: [
              {
                sessionId: session!.id,
                role: 'user',
                content: question,
              },
              {
                sessionId: session!.id,
                role: 'assistant',
                content: fullAnswer,
                sources: sources,
              },
            ],
          });

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[chat stream error]', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`)
          );
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
    console.error('[/api/chat POST]', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
