// Free local embeddings using @xenova/transformers
// No API key needed, runs entirely on your machine
// 384-dim vectors, stored in Qdrant

let pipeline: any = null;

async function getEmbedder() {
  if (!pipeline) {
    const { pipeline: createPipeline, env } = await import('@xenova/transformers');
    // Cache models locally
    env.cacheDir = './.cache/transformers';
    pipeline = await createPipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }
  return pipeline;
}

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text.slice(0, 4000), {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data) as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const embedder = await getEmbedder();
  const results: number[][] = [];
  // Process one at a time to avoid memory pressure
  for (const text of texts) {
    const output = await embedder(text.slice(0, 4000), {
      pooling: 'mean',
      normalize: true,
    });
    results.push(Array.from(output.data) as number[]);
  }
  return results;
}