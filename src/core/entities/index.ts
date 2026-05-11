// ─── Domain Entities ───────────────────────────────────────────────
// Core type definitions for the Spirit Echo application.
// These types describe the fundamental data shapes used across all layers.

// ─── Audio ──────────────────────────────────────────────────────────

/** A raw PCM audio chunk captured from the microphone (16kHz, mono, f32). */
export interface AudioChunk {
  /** The raw audio samples as 32-bit floats normalized to [-1, 1]. */
  samples: Float32Array;
  /** Timestamp (ms) when this chunk was captured, relative to stream start. */
  timestamp: number;
  /** Duration of this chunk in milliseconds. */
  durationMs: number;
  /** Sample rate in Hz (expected: 16000). */
  sampleRate: number;
}

// ─── Transcription ──────────────────────────────────────────────────

/** A final or partial transcript segment produced by Whisper. */
export interface TranscriptSegment {
  /** Unique identifier for this segment. */
  id: string;
  /** The transcribed text. */
  text: string;
  /** Whether this is a partial (in-progress) or final (committed) segment. */
  isPartial: boolean;
  /** Start time in ms relative to the recording session. */
  startMs: number;
  /** End time in ms relative to the recording session. */
  endMs: number;
  /** Confidence score (0-1), if provided by the model. */
  confidence?: number;
}

/** A complete recording session containing all transcript segments. */
export interface TranscriptionSession {
  /** Unique session identifier. */
  id: string;
  /** ISO timestamp when recording started. */
  startedAt: string;
  /** ISO timestamp when recording ended. */
  endedAt?: string;
  /** All transcript segments in chronological order. */
  segments: TranscriptSegment[];
  /** Full concatenated transcript text. */
  get fullText(): string;
}

// ─── AI Models ─────────────────────────────────────────────────────

/** Supported model backends for inference. */
export type InferenceBackend = 'webgpu' | 'wasm' | 'cpu';

/** Status of a model in the local cache. */
export type ModelCacheStatus = 'not-downloaded' | 'downloading' | 'cached' | 'corrupted';

/** Configuration for an AI model managed by the app. */
export interface ModelConfig {
  /** Unique model identifier (e.g., "Xenova/whisper-tiny.en"). */
  modelId: string;
  /** Human-readable display name. */
  displayName: string;
  /** The task this model performs (e.g., "automatic-speech-recognition"). */
  task: string;
  /** Approximate download size in bytes. */
  sizeBytes: number;
  /** Current cache status on this device. */
  cacheStatus: ModelCacheStatus;
  /** The inference backend currently in use for this model. */
  backend: InferenceBackend;
  /** Whether this model is currently loaded into memory. */
  isLoaded: boolean;
}

/** Progress event emitted during model download. */
export interface ModelDownloadProgress {
  modelId: string;
  /** Download progress 0-100. */
  progress: number;
  /** Human-readable status text (e.g., "Downloading encoder weights..."). */
  status: string;
  /** Bytes downloaded so far. */
  loadedBytes: number;
  /** Total bytes to download. */
  totalBytes: number;
}

// ─── RAG / Search ──────────────────────────────────────────────────

/** A document stored in the local vector database for RAG. */
export interface RagDocument {
  /** Unique document identifier. */
  id: string;
  /** The raw text content. */
  content: string;
  /** Source type (transcript, uploaded file, etc.). */
  source: 'transcript' | 'upload' | 'note';
  /** Associated transcription session ID, if sourced from a transcript. */
  sessionId?: string;
  /** ISO timestamp when this document was indexed. */
  indexedAt: string;
  /** Arbitrary metadata tags. */
  metadata?: Record<string, string>;
}

/** A single search result from the RAG engine. */
export interface SearchResult {
  /** The matched document. */
  document: RagDocument;
  /** Cosine similarity score (0-1). */
  score: number;
  /** A relevant excerpt/snippet from the document. */
  snippet: string;
}

/** A RAG-enhanced response from Gemma. */
export interface RagResponse {
  /** Gemma's generated answer grounded in retrieved documents. */
  answer: string;
  /** The search results that informed this answer. */
  sources: SearchResult[];
  /** ISO timestamp of the query. */
  queriedAt: string;
}

// ─── App State ──────────────────────────────────────────────────────

/** Overall transcription pipeline status. */
export type TranscriptionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'recording'
  | 'error';

/** Performance metrics for the current inference session. */
export interface InferenceMetrics {
  /** The active inference backend. */
  backend: InferenceBackend;
  /** Average inference latency in ms. */
  avgLatencyMs: number;
  /** Peak memory usage in MB (if available). */
  peakMemoryMb?: number;
  /** Total audio seconds processed. */
  totalAudioSeconds: number;
}
