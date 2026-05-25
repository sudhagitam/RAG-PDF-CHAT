#!/usr/bin/env node
/**
 * Run this once after deploying Qdrant to Railway:
 *   node scripts/setup-qdrant.js
 *
 * Requires: QDRANT_URL and QDRANT_API_KEY in your environment
 */

require('dotenv').config({ path: '.env.local' });

const { QdrantClient } = require('@qdrant/js-client-rest');

const COLLECTION = process.env.QDRANT_COLLECTION || 'rag_documents';
const VECTOR_SIZE = 1536;

async function main() {
  const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });

  console.log(`🔗 Connecting to Qdrant at ${process.env.QDRANT_URL}...`);

  const { collections } = await client.getCollections();
  const exists = collections.some(c => c.name === COLLECTION);

  if (exists) {
    console.log(`✅ Collection "${COLLECTION}" already exists`);
  } else {
    await client.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      optimizers_config: { default_segment_number: 2 },
      replication_factor: 1,
    });
    console.log(`✅ Collection "${COLLECTION}" created`);
  }

  // Create payload indexes for fast filtering
  await client.createPayloadIndex(COLLECTION, {
    field_name: 'user_id',
    field_schema: 'keyword',
  });
  await client.createPayloadIndex(COLLECTION, {
    field_name: 'doc_id',
    field_schema: 'keyword',
  });

  console.log(`✅ Payload indexes created (user_id, doc_id)`);
  console.log(`\n🎉 Qdrant is ready! You can now run the app.`);
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
