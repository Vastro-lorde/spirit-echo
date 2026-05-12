// src/workers/transcription.worker.ts
// Background processing for audio transcription using WebGPU/Wasm models via Transformers.js.
// Integrates VAD to skip silent audio, manages memory with capped buffers,
// and includes retry logic for robust inference.

import { WhisperBinding } from '../infrastructure/ai/model-binding';
import { VoiceActivityDetector } from '../infrastructure/audio/vad';
import type { InferenceBackend } from '../core/entities';

// ─── Constants ──────────────────────────────────────────────────────

const SAMPLE_RATE = 16000;
/** Transcribe every ~1.5s of new audio for better context chunks. */
const CHUNK_SIZE_SAMPLES = Math.round(SAMPLE_RATE * 1.5);
/** Maximum buffer duration before forced commit (~30s, Whisper context limit). */
const MAX_BUFFER_DURATION_S = 25;
const MAX_BUFFER_SAMPLES = SAMPLE_RATE * MAX_BUFFER_DURATION_S;
/** How long (ms) of continuous silence before committing the current partial. */
const SILENCE_COMMIT_MS = 2500;
const SILENCE_COMMIT_SAMPLES = Math.round((SILENCE_COMMIT_MS / 1000) * SAMPLE_RATE);
/** Maximum retries for a failed transcription call. */
const MAX_RETRIES = 3;

// ─── State ──────────────────────────────────────────────────────────

let transcriber: any = null;
let audioBuffer: Float32Array = new Float32Array(0);
let vad: VoiceActivityDetector | null = null;
let lastTranscriptionSampleIdx = 0;
let consecutiveSilenceSamples = 0;
let currentBackend: InferenceBackend = 'webgpu';
let isProcessing = false;
let transcriptionCount = 0;

// ─── Helpers ────────────────────────────────────────────────────────

/** Concatenate a new Float32Array chunk onto the accumulated buffer. */
function appendToBuffer(existing: Float32Array, chunk: Float32Array): Float32Array {
  const combined = new Float32Array(existing.length + chunk.length);
  combined.set(existing, 0);
  combined.set(chunk, existing.length);
  return combined;
}

/** Reset all audio state. */
function resetAudioState(): void {
  audioBuffer = new Float32Array(0);
  lastTranscriptionSampleIdx = 0;
  consecutiveSilenceSamples = 0;
  vad?.reset();
}

/** Post a typed message back to the main thread. */
function postMsg(data: Record<string, unknown>): void {
  self.postMessage(data);
}

// ─── Message Handler ────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'START':
      await handleStart();
      break;
    case 'AUDIO_CHUNK':
      await handleAudioChunk(payload as Float32Array);
      break;
    case 'STOP':
      await handleStop();
      break;
    default:
      console.warn('[transcription.worker] Unknown message type:', type);
  }
});

// ─── Handlers ───────────────────────────────────────────────────────

async function handleStart(): Promise<void> {
  try {
    postMsg({ type: 'STATUS', status: 'loading' });

    // Load Whisper Base (good balance of speed and accuracy)
    transcriber = await WhisperBinding.getInstance((info: any) => {
      postMsg({ type: 'PROGRESS', payload: info });
    }, 'base');

    // Detect which backend actually loaded
    currentBackend = detectLoadedBackend();
    const modelName = WhisperBinding.getCurrentModelName();

    // Initialize VAD with slightly more sensitive threshold for quiet speech
    vad = new VoiceActivityDetector(
      {
        energyThreshold: 0.005,  // Lower = more sensitive (was 0.01)
        speechStartPaddingMs: 150,
        speechEndPaddingMs: 800,
        debug: true,  // Enable VAD logging for diagnostics
      },
      SAMPLE_RATE,
    );
    resetAudioState();
    transcriptionCount = 0;

    console.log(
      `[transcription.worker] Ready — model: ${modelName}, backend: ${currentBackend}`,
    );

    postMsg({
      type: 'STATUS',
      status: 'ready',
      backend: currentBackend,
      modelName,
    });
  } catch (error) {
    console.error('[transcription.worker] Error loading whisper model:', error);
    postMsg({
      type: 'ERROR',
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleAudioChunk(chunk: Float32Array): Promise<void> {
  if (!transcriber) {
    postMsg({ type: 'ERROR', payload: 'Model not initialized. Press "Load AI Model" first.' });
    return;
  }

  // Accumulate samples
  audioBuffer = appendToBuffer(audioBuffer, chunk);

  // Run VAD on the new chunk
  const vadState = vad!.processChunk(chunk);

  if (vadState === 'speech') {
    consecutiveSilenceSamples = 0;
  } else {
    consecutiveSilenceSamples += chunk.length;
  }

  // ── Transcription trigger conditions ──────────────────────────────
  const newSamplesSinceLast = audioBuffer.length - lastTranscriptionSampleIdx;
  const shouldTranscribeChunk = newSamplesSinceLast >= CHUNK_SIZE_SAMPLES;
  const silenceCommit = consecutiveSilenceSamples >= SILENCE_COMMIT_SAMPLES && audioBuffer.length > 0;
  const bufferFull = audioBuffer.length >= MAX_BUFFER_SAMPLES;

  if ((shouldTranscribeChunk || silenceCommit || bufferFull) && !isProcessing) {
    await transcribeCurrent(isBufferCommit(silenceCommit, bufferFull));
  }

  // Safety valve: hard cap at 35s to prevent runaway memory
  if (audioBuffer.length > SAMPLE_RATE * 35) {
    audioBuffer = audioBuffer.slice(-MAX_BUFFER_SAMPLES);
    lastTranscriptionSampleIdx = Math.max(0, lastTranscriptionSampleIdx - (SAMPLE_RATE * 10));
    console.warn('[transcription.worker] Buffer capped to prevent OOM');
  }
}

async function handleStop(): Promise<void> {
  // Transcribe any remaining audio
  if (audioBuffer.length > 0 && transcriber) {
    await transcribeCurrent(true);
  }
  resetAudioState();
  postMsg({ type: 'STATUS', status: 'ready', backend: currentBackend });
}

// ─── Core Transcription ─────────────────────────────────────────────

function isBufferCommit(silenceCommit: boolean, bufferFull: boolean): boolean {
  return silenceCommit || bufferFull;
}

async function transcribeCurrent(commit: boolean): Promise<void> {
  if (isProcessing || audioBuffer.length === 0) return;
  isProcessing = true;
  transcriptionCount++;

  const audioDurationS = (audioBuffer.length / SAMPLE_RATE).toFixed(1);
  const startedAt = performance.now();

  // Notify UI that Whisper is actively processing
  postMsg({ type: 'PROCESSING', payload: true });

  console.log(
    `[transcription.worker] #${transcriptionCount} Transcribing ${audioDurationS}s of audio` +
    (commit ? ' (commit)' : ' (partial)'),
  );

  try {
    const result = await transcribeWithRetry(audioBuffer);
    lastTranscriptionSampleIdx = audioBuffer.length;

    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(
      `[transcription.worker] #${transcriptionCount} Done in ${elapsedMs}ms` +
      ` — "${result?.text?.slice(0, 60)}${(result?.text?.length ?? 0) > 60 ? '...' : ''}"`,
    );

    if (result) {
      postMsg({
        type: 'TRANSCRIPT',
        payload: result.text,
        isPartial: !commit,
        index: transcriptionCount,
        durationMs: elapsedMs,
        audioSeconds: parseFloat(audioDurationS),
      });
    }

    // On commit: reset the buffer to free memory
    if (commit) {
      audioBuffer = new Float32Array(0);
      lastTranscriptionSampleIdx = 0;
      consecutiveSilenceSamples = 0;
      vad?.reset();
    }
  } catch (error) {
    console.error('[transcription.worker] Transcription failed:', error);
    postMsg({
      type: 'ERROR',
      payload: `Transcription error: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    isProcessing = false;
    postMsg({ type: 'PROCESSING', payload: false });
  }
}

/** Transcribe with automatic retry on failure. */
async function transcribeWithRetry(
  audioData: Float32Array,
  attempt: number = 0,
): Promise<{ text: string } | null> {
  try {
    return await transcriber(audioData);
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      console.warn(
        `[transcription.worker] Retry ${attempt + 1}/${MAX_RETRIES} after error:`,
        error instanceof Error ? error.message : error,
      );
      // Small backoff before retry
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      return transcribeWithRetry(audioData, attempt + 1);
    }
    throw error;
  }
}

// ─── Backend Detection ──────────────────────────────────────────────

/** Determine which inference backend is actually loaded. */
function detectLoadedBackend(): InferenceBackend {
  // Transformers.js exposes the active device via the pipeline internals
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      return 'webgpu';
    }
  } catch { /* worker may not have navigator.gpu */ }

  if (typeof WebAssembly === 'object') {
    return 'wasm';
  }
  return 'cpu';
}
