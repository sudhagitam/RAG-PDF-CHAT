import { QdrantClient } from '@qdrant/js-client-rest';

const COLLECTION = process.env.QDRANT_COLLECTION || 'rag_documents';
const VECTOR_SIZE = 1536; // text-embedding-3-small

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return client;
}

export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrantClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: {
        size: VECTOR_SIZE,
        distance: 'Cosine',
      },
      optimizers_config: {
        default_segment_number: 2,
      },
      replication_factor: 1,
    });

    // Create payload indexes for fast filtering
    await qdrant.createPayloadIndex(COLLECTION, {
      field_name: 'user_id',
      field_schema: 'keyword',
    });
    await qdrant.createPayloadIndex(COLLECTION, {
      field_name: 'doc_id',
      field_schema: 'keyword',
    });

    console.log(`✅ Qdrant collection "${COLLECTION}" created`);
  }
}

export { COLLECTION };
