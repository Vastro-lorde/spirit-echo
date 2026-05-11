// src/workers/rag-embedding.worker.ts
// Background processing for semantic search over transcriptions using
// LanceDB (WASM) as the local vector store and Transformers.js for embeddings.
//
// Supported operations:
//   INIT       — Initialize LanceDB and load the embedding model
//   INDEX      — Embed and store a transcript/document
//   SEARCH     — Semantic search across indexed documents
//   DELETE     — Remove a document by ID
//   COUNT      — Get total indexed document count

import { pipeline, env } from '@huggingface/transformers';
import * as lancedb from '@lancedb/lancedb';

env.allowLocalModels = false;

// ─── Constants ──────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const TABLE_NAME = 'transcript_embeddings';
const EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 outputs 384-dim vectors

// ─── State ──────────────────────────────────────────────────────────

let db: lancedb.Connection | null = null;
let table: lancedb.Table | null = null;
let embedder: any = null;
let initialized = false;

// ─── Helpers ────────────────────────────────────────────────────────

function postMsg(data: Record<string, unknown>): void {
  self.postMessage(data);
}

// ─── Message Handler ────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'INIT':
      await handleInit();
      break;
    case 'INDEX':
      await handleIndex(payload);
      break;
    case 'SEARCH':
      await handleSearch(payload);
      break;
    case 'DELETE':
      await handleDelete(payload?.id);
      break;
    case 'COUNT':
      await handleCount();
      break;
    default:
      console.warn('[rag-embedding.worker] Unknown message type:', type);
  }
});

// ─── Handlers ───────────────────────────────────────────────────────

async function handleInit(): Promise<void> {
  if (initialized) {
    postMsg({ type: 'STATUS', status: 'ready' });
    return;
  }

  try {
    postMsg({ type: 'STATUS', status: 'loading' });

    // 1. Initialize LanceDB (in-memory WASM, persists to OPFS automatically)
    db = await lancedb.connect({
      uri: 'memory://spirit-echo-rag',
    });

    // 2. Load or create the embeddings table
    const tableNames = await db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      table = await db.openTable(TABLE_NAME);
    } else {
      // Create a fresh table with an embedding column
      table = await db.createTable(TABLE_NAME, []);
    }

    // 3. Load the embedding model
    embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      progress_callback: (info: any) => {
        postMsg({ type: 'PROGRESS', payload: info });
      },
      device: 'webgpu',
    });

    initialized = true;
    postMsg({ type: 'STATUS', status: 'ready' });
  } catch (error) {
    postMsg({
      type: 'ERROR',
      payload: `RAG init failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleIndex(payload: {
  id: string;
  content: string;
  source?: string;
  sessionId?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  if (!initialized || !embedder || !db) {
    postMsg({ type: 'ERROR', payload: 'RAG engine not initialized. Call INIT first.' });
    return;
  }

  try {
    // Generate embedding
    const output = await embedder(payload.content, {
      pooling: 'mean',
      normalize: true,
    });
    const vector = Array.from(output.data as Float32Array) as number[];

    // Ensure table exists
    if (!table) {
      const tableNames = await db!.tableNames();
      if (tableNames.includes(TABLE_NAME)) {
        table = await db!.openTable(TABLE_NAME);
      } else {
        table = await db!.createTable(TABLE_NAME, [
          {
            id: payload.id,
            content: payload.content,
            vector,
            source: payload.source ?? 'transcript',
            sessionId: payload.sessionId ?? '',
            metadata: JSON.stringify(payload.metadata ?? {}),
            indexedAt: new Date().toISOString(),
          },
        ]);
        postMsg({ type: 'INDEXED', payload: { id: payload.id } });
        return;
      }
    }

    // Append to existing table
    await table.add([
      {
        id: payload.id,
        content: payload.content,
        vector,
        source: payload.source ?? 'transcript',
        sessionId: payload.sessionId ?? '',
        metadata: JSON.stringify(payload.metadata ?? {}),
        indexedAt: new Date().toISOString(),
      },
    ]);

    postMsg({ type: 'INDEXED', payload: { id: payload.id } });
  } catch (error) {
    postMsg({
      type: 'ERROR',
      payload: `Indexing failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleSearch(payload: {
  query: string;
  limit?: number;
}): Promise<void> {
  if (!initialized || !embedder || !table) {
    postMsg({ type: 'ERROR', payload: 'RAG engine not initialized. Call INIT first.' });
    return;
  }

  try {
    // Generate query embedding
    const output = await embedder(payload.query, {
      pooling: 'mean',
      normalize: true,
    });
    const queryVector = Array.from(output.data as Float32Array) as number[];

    // Search LanceDB with cosine similarity
    const results = await table!
      .search(queryVector)
      .limit(payload.limit ?? 5)
      .toArray();

    postMsg({
      type: 'SEARCH_RESULTS',
      payload: results.map((row: any) => ({
        id: row.id,
        content: row.content,
        source: row.source,
        sessionId: row.sessionId,
        score: row._distance ? 1 - row._distance : 0, // Convert L2 to similarity
        snippet: row.content?.slice(0, 300) ?? '',
        indexedAt: row.indexedAt,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
      })),
    });
  } catch (error) {
    postMsg({
      type: 'ERROR',
      payload: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleDelete(id: string): Promise<void> {
  if (!table) return;
  try {
    await table.delete(`id = '${id}'`);
    postMsg({ type: 'DELETED', payload: { id } });
  } catch (error) {
    postMsg({
      type: 'ERROR',
      payload: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleCount(): Promise<void> {
  if (!table) {
    postMsg({ type: 'COUNT', payload: 0 });
    return;
  }
  try {
    const count = await table.countRows();
    postMsg({ type: 'COUNT', payload: count });
  } catch {
    postMsg({ type: 'COUNT', payload: 0 });
  }
}
