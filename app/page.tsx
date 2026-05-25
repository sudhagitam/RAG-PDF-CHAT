import Link from 'next/link';
import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

export default async function LandingPage() {
  const { userId } = await auth();
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: '640px', width: '100%', textAlign: 'center', position: 'relative' }}>
        {/* Logo mark */}
        <div style={{
          width: '56px', height: '56px',
          background: 'var(--accent)',
          borderRadius: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 2rem',
          fontSize: '24px',
          boxShadow: '0 0 40px rgba(108,99,255,0.4)',
        }}>
          ◈
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          margin: '0 0 1.25rem',
          background: 'linear-gradient(135deg, #f0f0f5 0%, #9090a8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Chat with your<br />documents
        </h1>

        <p style={{
          fontSize: '1.15rem',
          color: 'var(--text-2)',
          lineHeight: 1.6,
          margin: '0 0 2.5rem',
        }}>
          Upload any PDF — reports, papers, contracts — and ask questions.
          Powered by Groq + Qdrant for lightning-fast, accurate answers.
        </p>

        {/* Features */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          margin: '0 0 2.5rem',
        }}>
          {['Multi-PDF upload', 'Persistent vectors', 'Streaming answers', 'Per-user isolation'].map(f => (
            <span key={f} style={{
              padding: '0.35rem 0.85rem',
              borderRadius: '100px',
              border: '1px solid var(--border)',
              fontSize: '0.85rem',
              color: 'var(--text-2)',
              background: 'var(--bg-2)',
            }}>{f}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          {userId ? (
            <Link href="/chat" style={{
              padding: '0.8rem 2rem',
              background: 'var(--accent)',
              color: '#fff',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}>
              Open DocMind →
            </Link>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button style={{
                  padding: '0.8rem 2rem',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}>
                  Get started free
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button style={{
                  padding: '0.8rem 2rem',
                  background: 'transparent',
                  color: 'var(--text-1)',
                  border: '1px solid var(--border-hover)',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}>
                  Sign in
                </button>
              </SignInButton>
            </>
          )}
        </div>

        {/* Stack logos */}
        <p style={{ marginTop: '3rem', fontSize: '0.8rem', color: 'var(--text-3)' }}>
          Built on Groq · Qdrant · OpenAI Embeddings · Clerk · PostgreSQL
        </p>
      </div>
    </main>
  );
}
