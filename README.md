# DocMind — RAG PDF Chat App

A production-grade AI document chat application. Upload PDFs, ask questions, get streaming answers powered by Groq + Qdrant.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router |
| Auth | Clerk |
| LLM | Groq (llama-3.3-70b-versatile) |
| Embeddings | OpenAI text-embedding-3-small |
| Vector DB | Qdrant (self-hosted on Railway) |
| Database | PostgreSQL via Prisma |
| Deploy | Railway + Vercel |

---

## Local Dev (Quick Start)

```bash
# 1. Install
npm install

# 2. Env vars
cp .env.example .env.local
# Fill in GROQ_API_KEY, OPENAI_API_KEY, CLERK keys, QDRANT_URL, DATABASE_URL

# 3. Qdrant locally
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
node scripts/setup-qdrant.js

# 4. Postgres
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15
npx prisma migrate dev --name init

# 5. Run
npm run dev
```

## Production: Railway Deployment

1. **Qdrant service** → Docker image `qdrant/qdrant:latest` + Volume at `/qdrant/storage`
2. **PostgreSQL service** → Railway native Postgres
3. **Next.js service** → GitHub repo + all env vars

Run once after deploy:
```bash
node scripts/setup-qdrant.js
npx prisma migrate deploy
```

## Project Structure

```
app/
  api/
    chat/route.ts          # Groq streaming (SSE)
    documents/route.ts     # PDF upload → Qdrant
    history/route.ts       # Chat history
    health/route.ts
  chat/page.tsx            # Main UI
lib/
  groq.ts                  # Groq client + prompts
  qdrant.ts                # Vector DB client
  embeddings.ts            # OpenAI embeddings
  pdf.ts                   # PDF parse + chunking
  prisma.ts
prisma/schema.prisma
scripts/setup-qdrant.js
middleware.ts              # Clerk auth guard
```

See full docs in README for API reference and model options.
