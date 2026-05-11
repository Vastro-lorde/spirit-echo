'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ModelConfig, ModelCacheStatus, InferenceBackend } from '@/core/entities';

/** Known models available for this app. */
const AVAILABLE_MODELS: Omit<ModelConfig, 'cacheStatus' | 'backend' | 'isLoaded'>[] = [
  {
    modelId: 'Xenova/whisper-tiny.en',
    displayName: 'Whisper Tiny (English)',
    task: 'automatic-speech-recognition',
    sizeBytes: 75 * 1024 * 1024, // ~75MB
  },
  {
    modelId: 'Xenova/whisper-base.en',
    displayName: 'Whisper Base (English)',
    task: 'automatic-speech-recognition',
    sizeBytes: 142 * 1024 * 1024, // ~142MB
  },
  {
    modelId: 'Xenova/gemma-2-2b-it',
    displayName: 'Gemma 2 2B Instruct',
    task: 'text-generation',
    sizeBytes: 2.6 * 1024 * 1024 * 1024, // ~2.6GB
  },
  {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    displayName: 'All-MiniLM-L6-v2 (Embeddings)',
    task: 'feature-extraction',
    sizeBytes: 23 * 1024 * 1024, // ~23MB
  },
];

/** OPFS root for cached Transformers.js models. */
const CACHE_ROOT = 'transformers-cache';

async function getCachedModels(): Promise<Set<string>> {
  try {
    const root = await navigator.storage.getDirectory();
    const cached = new Set<string>();
    // Transformers.js stores models under a specific path structure
    // We check if the directory exists as a heuristic for "cached"
    for await (const [name] of (root as any).entries()) {
      if (name.includes('transformers') || name.includes('onnx') || name.includes('Xenova')) {
        cached.add(name);
      }
    }
    return cached;
  } catch {
    return new Set();
  }
}

async function getCacheSize(): Promise<number> {
  try {
    const estimate = await navigator.storage.estimate();
    return estimate.usage ?? 0;
  } catch {
    return 0;
  }
}

async function clearModelCache(modelId: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const modelDir = modelId.replace(/\//g, '_');
    await root.removeEntry(modelDir, { recursive: true }).catch(() => {
      // Directory may not exist, ignore
    });
  } catch {
    // Best-effort cleanup
  }
}

export function useModelManager() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [totalCacheBytes, setTotalCacheBytes] = useState<number>(0);
  const [backend, setBackend] = useState<InferenceBackend>('webgpu');
  const [loading, setLoading] = useState(true);

  const refreshModels = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await getCachedModels();
      const cacheSize = await getCacheSize();

      // Detect backend
      const be: InferenceBackend =
        typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm';

      const withStatus: ModelConfig[] = AVAILABLE_MODELS.map((m) => ({
        ...m,
        cacheStatus: cached.has(m.modelId.replace(/\//g, '_')) ? 'cached' as ModelCacheStatus : 'not-downloaded' as ModelCacheStatus,
        backend: be,
        isLoaded: false,
      }));

      setModels(withStatus);
      setTotalCacheBytes(cacheSize);
      setBackend(be);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    await clearModelCache(modelId);
    await refreshModels();
  }, [refreshModels]);

  const clearAllCache = useCallback(async () => {
    for (const model of AVAILABLE_MODELS) {
      await clearModelCache(model.modelId);
    }
    await refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  return {
    models,
    totalCacheBytes,
    backend,
    loading,
    deleteModel,
    clearAllCache,
    refreshModels,
  };
}
