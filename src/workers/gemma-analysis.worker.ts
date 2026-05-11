// src/workers/gemma-analysis.worker.ts
// Runs Gemma text-generation inference in a dedicated worker thread.
// Handles summarization, action extraction, and Q&A on transcript text.
// Keeps heavy LLM inference off the main thread to avoid UI jank.

import { GemmaBinding } from '../infrastructure/ai/gemma-binding';
import type { GemmaTask, GemmaAnalysisResult } from '../infrastructure/ai/gemma-binding';

interface WorkerMessage {
  type: 'INIT' | 'ANALYZE' | 'DISPOSE';
  transcript?: string;
  task?: GemmaTask;
  question?: string;
}

let initialized = false;

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, transcript, task, question } = event.data;

  switch (type) {
    case 'INIT':
      await handleInit();
      break;

    case 'ANALYZE':
      if (!transcript || !task) {
        self.postMessage({ type: 'ERROR', payload: 'Missing transcript or task' });
        return;
      }
      await handleAnalyze(transcript, task, question);
      break;

    case 'DISPOSE':
      GemmaBinding.dispose();
      initialized = false;
      self.postMessage({ type: 'STATUS', status: 'idle' });
      break;

    default:
      console.warn('[gemma-analysis.worker] Unknown message type:', type);
  }
});

async function handleInit(): Promise<void> {
  if (initialized) {
    self.postMessage({ type: 'STATUS', status: 'ready' });
    return;
  }

  try {
    self.postMessage({ type: 'STATUS', status: 'loading' });

    await GemmaBinding.getInstance((info: any) => {
      self.postMessage({ type: 'PROGRESS', payload: info });
    });

    initialized = true;
    self.postMessage({ type: 'STATUS', status: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleAnalyze(
  transcript: string,
  task: GemmaTask,
  question?: string,
): Promise<void> {
  try {
    self.postMessage({ type: 'STATUS', status: 'analyzing' });

    const result: GemmaAnalysisResult = await GemmaBinding.analyze(
      transcript,
      task,
      question,
    );

    self.postMessage({ type: 'RESULT', payload: result });
    self.postMessage({ type: 'STATUS', status: 'ready' });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}
