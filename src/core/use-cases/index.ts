// ─── Core Use Cases ─────────────────────────────────────────────────
// Orchestration logic that coordinates infrastructure adapters (AI models,
// audio streams, vector DB) to fulfill application features.
// These are pure TypeScript functions — no UI or framework dependencies.

import type {
  TranscriptionSession,
  TranscriptSegment,
  AudioChunk,
  SearchResult,
  RagDocument,
} from '../entities';

// ─── Transcription ──────────────────────────────────────────────────

export interface TranscriptionPort {
  /** Start capturing audio from the microphone. */
  startCapture(onChunk: (chunk: AudioChunk) => void): Promise<void>;
  /** Stop audio capture. */
  stopCapture(): void;
  /** Run Whisper inference on an audio buffer. */
  transcribe(audio: Float32Array): Promise<{ text: string }>;
  /** Check if the model is loaded and ready. */
  isModelReady(): boolean;
}

/**
 * Orchestrate a real-time transcription session.
 * Delegates audio capture and inference to the provided port adapters.
 */
export async function runTranscriptionSession(
  port: TranscriptionPort,
  onSegment: (segment: TranscriptSegment) => void,
): Promise<TranscriptionSession> {
  const session: TranscriptionSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    segments: [],
    get fullText() {
      return this.segments.map((s) => s.text).join(' ');
    },
  };

  const segmentId = () =>
    `seg-${session.id}-${session.segments.length.toString().padStart(4, '0')}`;

  // Resolve when the user stops recording
  await new Promise<void>((resolve) => {
    port.startCapture(async (chunk: AudioChunk) => {
      if (!port.isModelReady()) return;

      const result = await port.transcribe(chunk.samples);
      if (result.text.trim()) {
        const segment: TranscriptSegment = {
          id: segmentId(),
          text: result.text.trim(),
          isPartial: true,
          startMs: chunk.timestamp,
          endMs: chunk.timestamp + chunk.durationMs,
        };
        session.segments.push(segment);
        onSegment(segment);
      }
    });

    // stopCapture will be called externally; for now we resolve immediately
    // In real usage, the caller manages the lifecycle
    resolve();
  });

  session.endedAt = new Date().toISOString();
  return session;
}

// ─── RAG / Search ───────────────────────────────────────────────────

export interface RagPort {
  /** Index a document into the vector store. */
  indexDocument(doc: RagDocument): Promise<void>;
  /** Search for semantically similar documents. */
  search(query: string, limit?: number): Promise<SearchResult[]>;
  /** Delete a document by ID. */
  deleteDocument(id: string): Promise<void>;
  /** Get the total number of indexed documents. */
  countDocuments(): Promise<number>;
}

/**
 * Index a completed transcription session into the RAG store.
 */
export async function indexTranscriptionSession(
  ragPort: RagPort,
  session: TranscriptionSession,
): Promise<void> {
  // Index individual segments for granular search
  for (const segment of session.segments) {
    if (segment.text.trim().length < 10) continue; // Skip very short segments
    await ragPort.indexDocument({
      id: segment.id,
      content: segment.text,
      source: 'transcript',
      sessionId: session.id,
      indexedAt: new Date().toISOString(),
      metadata: {
        startedAt: session.startedAt,
        segmentIndex: String(session.segments.indexOf(segment)),
      },
    });
  }

  // Also index the full transcript as a single document
  await ragPort.indexDocument({
    id: `full-${session.id}`,
    content: session.fullText,
    source: 'transcript',
    sessionId: session.id,
    indexedAt: new Date().toISOString(),
  });
}

// ─── Model Management ───────────────────────────────────────────────

export interface ModelPort {
  /** Download/prepare a model for inference. */
  loadModel(modelId: string, onProgress?: (info: any) => void): Promise<void>;
  /** Check if a model is cached locally. */
  isModelCached(modelId: string): Promise<boolean>;
  /** Delete a cached model. */
  deleteModel(modelId: string): Promise<void>;
  /** Get total cache size in bytes. */
  getCacheSize(): Promise<number>;
}

/**
 * Ensure all required models for the app are available locally.
 * Returns the set of models that were successfully loaded.
 */
export async function ensureRequiredModels(
  modelPort: ModelPort,
  requiredModels: string[],
  onProgress?: (modelId: string, info: any) => void,
): Promise<string[]> {
  const loaded: string[] = [];

  for (const modelId of requiredModels) {
    try {
      await modelPort.loadModel(modelId, (info) => onProgress?.(modelId, info));
      loaded.push(modelId);
    } catch (error) {
      console.warn(`[ensureRequiredModels] Failed to load ${modelId}:`, error);
    }
  }

  return loaded;
}

// ─── Export ──────────────────────────────────────────────────────────

export interface ExportPort {
  /** Save content to a file (triggers native save dialog in Tauri). */
  saveFile(content: string, filename: string, mimeType?: string): Promise<boolean>;
}

/** Export a transcription session as a formatted Markdown document. */
export function formatSessionAsMarkdown(session: TranscriptionSession): string {
  const lines: string[] = [
    `# Transcription Session`,
    `**Date:** ${new Date(session.startedAt).toLocaleString()}`,
    `**Duration:** ${formatDuration(session)}`,
    ``,
    `---`,
    ``,
  ];

  for (const segment of session.segments) {
    const time = new Date(
      new Date(session.startedAt).getTime() + segment.startMs,
    ).toLocaleTimeString();
    lines.push(`**[${time}]** ${segment.text}`);
  }

  return lines.join('\n');
}

/** Format a transcription session as JSON. */
export function formatSessionAsJson(session: TranscriptionSession): string {
  return JSON.stringify(
    {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      segments: session.segments.map((s) => ({
        text: s.text,
        startMs: s.startMs,
        endMs: s.endMs,
        confidence: s.confidence,
      })),
    },
    null,
    2,
  );
}

/** Human-readable duration string for a session. */
function formatDuration(session: TranscriptionSession): string {
  if (!session.endedAt) return 'In progress';
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  const seconds = Math.round((end - start) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
