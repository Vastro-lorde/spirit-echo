// ─── Tauri Bridge ──────────────────────────────────────────────────
// Provides a unified API for Tauri desktop features with graceful
// fallback to browser-only behavior when not running inside Tauri.
//
// Usage:
//   import { tauri } from '@/infrastructure/tauri-bridge';
//   const dataDir = await tauri.getAppDataDir();
//   await tauri.exportTranscript(content, filename);

import type { InvokeArgs } from '@tauri-apps/api/core';

/** Detects whether the app is running inside a Tauri webview. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Invoke a Tauri command with type-safe arguments.
 * Returns null if not running in Tauri (graceful degradation).
 */
async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return await tauriInvoke<T>(cmd, args);
  } catch (error) {
    console.warn(`[tauri-bridge] Command '${cmd}' failed:`, error);
    return null;
  }
}

/** Native file save dialog via Tauri. Falls back to browser download. */
async function nativeSaveFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain',
): Promise<boolean> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        defaultPath: filename,
        filters: [
          { name: 'Text Files', extensions: ['txt', 'md'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        return true;
      }
      return false; // User cancelled
    } catch (error) {
      console.error('[tauri-bridge] Native save failed, falling back to browser:', error);
    }
  }

  // Browser fallback: trigger a download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

// ─── Public API ─────────────────────────────────────────────────────

export const tauri = {
  /** Check if running inside Tauri desktop app. */
  isTauri,

  /** Get the app's local data directory path. */
  async getAppDataDir(): Promise<string | null> {
    return invoke<string>('get_app_data_dir');
  },

  /** Get total model cache size in bytes. */
  async getModelCacheSize(): Promise<number | null> {
    return invoke<number>('get_model_cache_size');
  },

  /** Clear all cached model files. Returns bytes freed, or null. */
  async clearModelCache(): Promise<number | null> {
    return invoke<number>('clear_model_cache');
  },

  /**
   * Export content as a file. Uses native save dialog in Tauri,
   * falls back to browser download. Returns true if saved successfully.
   */
  async exportTranscript(
    content: string,
    filename?: string,
  ): Promise<boolean> {
    const name = filename ?? `transcript-${Date.now()}.txt`;
    return nativeSaveFile(content, name, 'text/plain');
  },

  /**
   * Export content as a Markdown file.
   */
  async exportMarkdown(
    content: string,
    filename?: string,
  ): Promise<boolean> {
    const name = filename ?? `transcript-${Date.now()}.md`;
    return nativeSaveFile(content, name, 'text/markdown');
  },

  /**
   * Export content as a JSON file.
   */
  async exportJson(
    data: unknown,
    filename?: string,
  ): Promise<boolean> {
    const name = filename ?? `transcript-${Date.now()}.json`;
    return nativeSaveFile(JSON.stringify(data, null, 2), name, 'application/json');
  },
};
