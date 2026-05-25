import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractPdfText, chunkText } from '@/lib/pdf';
import { embedBatch } from '@/lib/embeddings';
import { getQdrantClient, ensureCollection, COLLECTION } from '@/lib/qdrant';
import { prisma } from '@/lib/prisma';

export const maxDuration = 120; // 2 min timeout for large PDFs
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50')) * 1024 * 1024;
const EMBED_BATCH_SIZE = 20;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Validate files
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json(
          { error: `File "${file.name}" is not a PDF` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds ${process.env.MAX_FILE_SIZE_MB || 50}MB limit` },
          { status: 400 }
        );
      }
    }

    await ensureCollection();
    const qdrant = getQdrantClient();
    const results = [];

    for (const file of files) {
      const docId = uuidv4();
      const buffer = Buffer.from(await file.arrayBuffer());

      // 1. Create DB record (status: processing)
      const doc = await prisma.document.create({
        data: {
          id: docId,
          userId,
          filename: file.name,
          fileSize: file.size,
          status: 'processing',
        },
      });

      try {
        // 2. Extract text from PDF
        const { text, pageCount } = await extractPdfText(buffer);

        // 3. Chunk text
        const chunks = chunkText(text);

        // 4. Embed in batches
        const points = [];
        for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
          const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
          const vectors = await embedBatch(batch.map((c) => c.text));

          for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            points.push({
              id: uuidv4(),
              vector: vectors[j],
              payload: {
                user_id: userId,
                doc_id: docId,
                filename: file.name,
                page: chunk.pageNumber,
                chunk_index: chunk.chunkIndex,
                chunk_text: chunk.text,
                char_start: chunk.charStart,
                char_end: chunk.charEnd,
              },
            });
          }
        }

        // 5. Upsert to Qdrant
        await qdrant.upsert(COLLECTION, { points, wait: true });

        // 6. Update DB record
        await prisma.document.update({
          where: { id: docId },
          data: { status: 'ready', pageCount, chunkCount: chunks.length },
        });

        results.push({
          id: docId,
          filename: file.name,
          pageCount,
          chunkCount: chunks.length,
          status: 'ready',
        });
      } catch (err) {
        await prisma.document.update({
          where: { id: docId },
          data: { status: 'error' },
        });
        throw err;
      }
    }

    return NextResponse.json({ documents: results });
  } catch (err) {
    console.error('[/api/documents POST]', err);
    return NextResponse.json(
      { error: 'Failed to process documents' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (err) {
    console.error('[/api/documents GET]', err);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { docId } = await req.json();
    const doc = await prisma.document.findUnique({ where: { id: docId } });

    if (!doc || doc.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const qdrant = getQdrantClient();

    // Delete vectors from Qdrant
    await qdrant.delete(COLLECTION, {
      filter: {
        must: [
          { key: 'doc_id', match: { value: docId } },
          { key: 'user_id', match: { value: userId } },
        ],
      },
    });

    // Delete DB record
    await prisma.document.delete({ where: { id: docId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/documents DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
