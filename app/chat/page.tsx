'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { UserButton } from '@clerk/nextjs';

interface Document {
  id: string;
  filename: string;
  pageCount: number;
  chunkCount: number;
  status: string;
  createdAt: string;
}

interface Source {
  filename: string;
  page: number;
  chunkText: string;
  score: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  streaming?: boolean;
}

type GroqModel = 'fast' | 'balanced' | 'best';

const MODEL_LABELS: Record<GroqModel, string> = {
  fast: 'Fast (8B)',
  balanced: 'Balanced (Mixtral)',
  best: 'Best (70B)',
};

export default function ChatPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<GroqModel>('best');
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadDocuments(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function loadDocuments() {
    const res = await fetch('/api/documents');
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    const pdfFiles = Array.from(files).filter(f => f.name.endsWith('.pdf'));
    if (!pdfFiles.length) return;

    setUploading(true);
    setUploadProgress(`Processing ${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''}...`);

    const formData = new FormData();
    pdfFiles.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setUploadProgress(`✓ ${data.documents.length} document${data.documents.length > 1 ? 's' : ''} indexed`);
        await loadDocuments();
        setTimeout(() => setUploadProgress(''), 3000);
      } else {
        setUploadProgress(`✗ ${data.error}`);
        setTimeout(() => setUploadProgress(''), 4000);
      }
    } catch {
      setUploadProgress('✗ Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function deleteDocument(docId: string) {
    await fetch('/api/documents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  }

  async function sendMessage() {
    if (!question.trim() || streaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setQuestion('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId, model }),
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const event = JSON.parse(raw);
            if (event.type === 'session') {
              setSessionId(event.sessionId);
            } else if (event.type === 'token') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.text }
                    : m
                )
              );
            } else if (event.type === 'sources') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, sources: event.sources, streaming: false }
                    : m
                )
              );
            }
          } catch { /* skip malformed */ }
        }
      }
    } finally {
      setStreaming(false);
      setMessages(prev =>
        prev.map(m => m.id === assistantMsgId ? { ...m, streaming: false } : m)
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function newChat() {
    setMessages([]);
    setSessionId(null);
    setQuestion('');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, []);

  const sidebarW = sidebarOpen ? '280px' : '0px';

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── SIDEBAR ─────────────────────────────────── */}
      <aside style={{
        width: sidebarW,
        minWidth: sidebarW,
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>◈ DocMind</span>
          <UserButton />
        </div>

        {/* Upload zone */}
        <div style={{ padding: '0.75rem' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '1.25rem 1rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--accent-dim)' : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📄</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0 }}>
              {uploading ? uploadProgress || 'Uploading…' : 'Drop PDFs or click to upload'}
            </p>
            {uploadProgress && !uploading && (
              <p style={{ fontSize: '0.75rem', color: uploadProgress.startsWith('✓') ? 'var(--green)' : 'var(--red)', margin: '0.25rem 0 0' }}>
                {uploadProgress}
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files)}
          />
        </div>

        {/* Documents list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem 0.25rem' }}>
            Documents ({documents.length})
          </p>
          {documents.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', padding: '0.5rem 0.25rem' }}>
              No documents yet. Upload PDFs to get started.
            </p>
          )}
          {documents.map(doc => (
            <div key={doc.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.5rem',
              borderRadius: '8px',
              marginBottom: '2px',
              background: 'transparent',
            }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-3)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '0.9rem' }}>
                {doc.status === 'ready' ? '📗' : doc.status === 'processing' ? '⏳' : '❌'}
              </span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.filename}
                </p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0 }}>
                  {doc.pageCount}p · {doc.chunkCount} chunks
                </p>
              </div>
              <button
                onClick={() => deleteDocument(doc.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.85rem', padding: '2px', lineHeight: 1 }}
                title="Delete"
              >×</button>
            </div>
          ))}
        </div>

        {/* New chat button */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <button onClick={newChat} style={{
            width: '100%',
            padding: '0.6rem',
            background: 'var(--bg-3)',
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}>
            + New chat
          </button>
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ───────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          borderBottom: '1px solid var(--border)',
          gap: '0.75rem',
        }}>
          <button
            onClick={() => setSidebarOpen(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '1.1rem', padding: '4px', lineHeight: 1 }}
          >
            ☰
          </button>

          <div style={{ flex: 1 }} />

          {/* Model selector */}
          <select
            value={model}
            onChange={e => setModel(e.target.value as GroqModel)}
            style={{
              background: 'var(--bg-3)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.3rem 0.6rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {Object.entries(MODEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Powered by Groq
          </span>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1rem' }}>
          {messages.length === 0 && (
            <div style={{ maxWidth: '560px', margin: '4rem auto', textAlign: 'center' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>◈</p>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 0.5rem' }}>
                Ask anything about your documents
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                Upload PDFs in the sidebar, then ask questions. DocMind will find the relevant passages and answer using Groq.
              </p>
              {documents.length > 0 && (
                <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                  {['Summarize the key points', 'What are the main findings?', 'List all dates mentioned'].map(s => (
                    <button
                      key={s}
                      onClick={() => { setQuestion(s); textareaRef.current?.focus(); }}
                      style={{
                        padding: '0.45rem 0.9rem',
                        background: 'var(--bg-3)',
                        border: '1px solid var(--border)',
                        borderRadius: '100px',
                        fontSize: '0.8rem',
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                      }}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {messages.map(msg => (
              <div key={msg.id} className="animate-in" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, marginTop: '2px',
                  background: msg.role === 'user' ? 'var(--bg-3)' : 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', color: msg.role === 'user' ? 'var(--text-2)' : '#fff',
                  fontWeight: 700,
                }}>
                  {msg.role === 'user' ? 'U' : '◈'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    background: msg.role === 'user' ? 'var(--bg-3)' : 'transparent',
                    border: msg.role === 'user' ? '1px solid var(--border)' : 'none',
                    borderRadius: '12px',
                    padding: msg.role === 'user' ? '0.7rem 1rem' : '0',
                    fontSize: '0.9rem',
                    color: 'var(--text-1)',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                    {msg.streaming && (
                      <span style={{
                        display: 'inline-block', width: '2px', height: '1em',
                        background: 'var(--accent)', marginLeft: '2px', verticalAlign: 'middle',
                        animation: 'spin 0.8s steps(2) infinite',
                      }} />
                    )}
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {msg.sources.slice(0, 4).map((s, i) => (
                        <div key={i} style={{
                          padding: '0.25rem 0.6rem',
                          background: 'var(--accent-dim)',
                          border: '1px solid rgba(108,99,255,0.25)',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          color: 'var(--accent)',
                        }}
                          title={s.chunkText.slice(0, 200)}
                        >
                          📄 {s.filename}, p.{s.page}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '0.75rem 1rem 1rem',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
        }}>
          <div style={{
            maxWidth: '720px',
            margin: '0 auto',
            display: 'flex',
            gap: '0.5rem',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-hover)',
            borderRadius: '12px',
            padding: '0.5rem 0.5rem 0.5rem 1rem',
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={documents.length === 0 ? 'Upload documents first…' : 'Ask a question about your documents…'}
              disabled={streaming || documents.length === 0}
              rows={1}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-1)',
                fontSize: '0.9rem',
                resize: 'none',
                maxHeight: '140px',
                lineHeight: 1.6,
                padding: '0.25rem 0',
                fontFamily: 'inherit',
              }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 140) + 'px';
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!question.trim() || streaming || documents.length === 0}
              style={{
                width: '36px', height: '36px',
                background: question.trim() && !streaming && documents.length > 0 ? 'var(--accent)' : 'var(--bg-3)',
                border: 'none',
                borderRadius: '8px',
                cursor: question.trim() && !streaming && documents.length > 0 ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            >
              {streaming ? <span className="spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--text-3)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block' }} /> : '↑'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}
