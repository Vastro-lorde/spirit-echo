// ─── WebGPU Detection & Backend Info ────────────────────────────────
// Utilities for detecting WebGPU support and determining the active
// inference backend (WebGPU vs WASM fallback).

import type { InferenceBackend } from '@/core/entities';

/** Result of WebGPU capability detection. */
export interface WebGpuInfo {
  supported: boolean;
  adapterInfo?: {
    vendor: string;
    architecture: string;
    description: string;
    device: string;
  };
  error?: string;
}

/**
 * Detect whether WebGPU is available in the current browser/WebView.
 * Must be called from the main thread (navigator.gpu only exists there).
 */
export async function detectWebGpu(): Promise<WebGpuInfo> {
  const gpu = (navigator as any).gpu;
  if (!gpu) {
    return { supported: false, error: 'navigator.gpu not available' };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, error: 'No GPU adapter found' };
    }

    const adapterInfo = await adapter.requestAdapterInfo();
    return {
      supported: true,
      adapterInfo: {
        vendor: adapterInfo.vendor,
        architecture: adapterInfo.architecture,
        description: adapterInfo.description,
        device: adapterInfo.device,
      },
    };
  } catch (err) {
    return {
      supported: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Determine the active inference backend.
 * Prefers WebGPU, falls back to WASM, then CPU.
 */
export function determineBackend(): InferenceBackend {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'webgpu';
  }
  if (typeof WebAssembly === 'object') {
    return 'wasm';
  }
  return 'cpu';
}

/** Human-readable label for each backend. */
export const BACKEND_LABELS: Record<InferenceBackend, string> = {
  webgpu: 'WebGPU',
  wasm: 'WASM',
  cpu: 'CPU',
};
