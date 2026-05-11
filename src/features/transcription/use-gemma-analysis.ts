'use client';

import { useState, useRef, useCallback } from 'react';
import type { GemmaTask, GemmaAnalysisResult } from '@/infrastructure/ai/gemma-binding';

type GemmaStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

export function useGemmaAnalysis() {
  const [status, setStatus] = useState<GemmaStatus>('idle');
  const [result, setResult] = useState<GemmaAnalysisResult | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    workerRef.current = new Worker(
      new URL('../../workers/gemma-analysis.worker.ts', import.meta.url),
      { type: 'module' },
    );

    workerRef.current.onmessage = (event) => {
      const { type, payload, status: workerStatus } = event.data;

      switch (type) {
        case 'STATUS':
          setStatus(workerStatus);
          break;
        case 'PROGRESS':
          setProgress(payload);
          break;
        case 'RESULT':
          setResult(payload);
          break;
        case 'ERROR':
          setError(payload);
          setStatus('error');
          break;
      }
    };

    return workerRef.current;
  }, []);

  const loadModel = useCallback(() => {
    setError(null);
    const worker = initWorker();
    worker.postMessage({ type: 'INIT' });
  }, [initWorker]);

  const analyze = useCallback(
    (transcript: string, task: GemmaTask, question?: string) => {
      setError(null);
      setResult(null);
      const worker = initWorker();
      worker.postMessage({ type: 'ANALYZE', transcript, task, question });
    },
    [initWorker],
  );

  const dispose = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'DISPOSE' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('idle');
    setResult(null);
  }, []);

  return {
    status,
    result,
    progress,
    error,
    loadModel,
    analyze,
    dispose,
  };
}
