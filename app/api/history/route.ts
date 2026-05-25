import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/history — list all sessions for user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[/api/history GET]', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

// DELETE /api/history — delete a session
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await req.json();
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

    if (!session || session.userId !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.chatSession.delete({ where: { id: sessionId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/history DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
