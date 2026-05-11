'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioStreamController } from '../../infrastructure/audio/stream-controller';
import type { InferenceBackend, TranscriptionStatus } from '../../core/entities';

export type { TranscriptionStatus };

export function useTranscription() {
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [partialTranscript, setPartialTranscript] = useState<string>('');
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<InferenceBackend>('webgpu');

  const workerRef = useRef<Worker | null>(null);
  const streamControllerRef = useRef<AudioStreamController | null>(null);

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(
      new URL('../../workers/transcription.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event) => {
      const { type, payload, status: workerStatus, isPartial, backend: workerBackend } = event.data;

      switch (type) {
        case 'STATUS':
          setStatus(workerStatus);
          if (workerBackend) {
            setBackend(workerBackend);
          }
          break;
        case 'PROGRESS':
          setProgress(payload);
          break;
        case 'TRANSCRIPT':
          if (isPartial) {
            setPartialTranscript(payload);
          } else {
            setTranscript((prev) => {
              // Avoid duplicate adjacent text
              if (prev.endsWith(payload)) return prev;
              return prev + (prev && !prev.endsWith(' ') ? ' ' : '') + payload;
            });
            setPartialTranscript('');
          }
          break;
        case 'ERROR':
          setError(payload);
          setStatus('error');
          break;
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const loadModel = useCallback(() => {
    if (workerRef.current) {
      setError(null);
      workerRef.current.postMessage({ type: 'START' });
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      streamControllerRef.current = new AudioStreamController((audioData) => {
        if (workerRef.current) {
          workerRef.current.postMessage(
            { type: 'AUDIO_CHUNK', payload: audioData },
            [audioData.buffer], // Transfer ownership for zero-copy
          );
        }
      });
      await streamControllerRef.current.start();
      setStatus('recording');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (streamControllerRef.current) {
      streamControllerRef.current.stop();
      streamControllerRef.current = null;
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'STOP' });
      }
      setStatus('ready');
    }
  }, []);

  return {
    status,
    transcript,
    partialTranscript,
    progress,
    error,
    backend,
    loadModel,
    startRecording,
    stopRecording,
    setTranscript,
  };
}
