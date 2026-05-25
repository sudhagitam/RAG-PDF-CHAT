import Groq from 'groq-sdk';

let groq: Groq | null = null;

export function getGroq(): Groq {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  }
  return groq;
}

export const GROQ_MODELS = {
  fast: 'llama-3.1-8b-instant',        // fastest, good for simple Q&A
  balanced: 'mixtral-8x7b-32768',       // strong reasoning
  best: 'llama-3.3-70b-versatile',      // best quality, 128k context
} as const;

export type GroqModel = keyof typeof GROQ_MODELS;

export const SYSTEM_PROMPT = `You are a precise document assistant. Your job is to answer questions based ONLY on the provided document context.

Rules:
- Answer using only information from the context below
- If the context doesn't contain the answer, say "I couldn't find that in the uploaded documents"
- Cite the source document and page number when possible, e.g. (Q3-Report.pdf, p.4)
- Be concise and factual
- Use markdown formatting for clarity (bullet points, bold, code blocks where appropriate)`;
