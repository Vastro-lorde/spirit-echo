import { pipeline, env } from '@huggingface/transformers';

// Keep local models disabled by default since we are loading via the browser
env.allowLocalModels = false;

/** Available Whisper models in order of accuracy (and size). */
export const WHISPER_MODELS = {
  /** ~39M params, fastest, least accurate. Good for testing. */
  tiny: 'Xenova/whisper-tiny.en',
  /** ~74M params, good balance of speed and accuracy. RECOMMENDED. */
  base: 'Xenova/whisper-base.en',
  /** ~244M params, significantly more accurate but slower. */
  small: 'Xenova/whisper-small.en',
} as const;

export type WhisperModelKey = keyof typeof WHISPER_MODELS;

export class WhisperBinding {
  private static instance: any = null;
  private static currentModelId: string | null = null;

  /**
   * Get or create the Whisper pipeline singleton.
   * @param modelKey - Which model variant to load (default: 'base').
   * @param progressCallback - Called with download progress updates.
   */
  static async getInstance(
    progressCallback?: (info: any) => void,
    modelKey: WhisperModelKey = 'base',
  ) {
    const modelId = WHISPER_MODELS[modelKey];

    // Re-initialize if a different model was requested
    if (this.instance && this.currentModelId !== modelId) {
      console.log(`[WhisperBinding] Switching model from ${this.currentModelId} to ${modelId}`);
      this.instance = null;
      this.currentModelId = null;
    }

    if (!this.instance) {
      console.log(`[WhisperBinding] Loading model: ${modelId} (device: webgpu, fallback: wasm)`);
      this.instance = await pipeline('automatic-speech-recognition', modelId, {
        progress_callback: progressCallback,
        device: 'webgpu',
      });
      this.currentModelId = modelId;
      console.log(`[WhisperBinding] Model loaded successfully: ${modelId}`);
    }
    return this.instance;
  }

  /** Get the currently loaded model ID. */
  static getCurrentModelId(): string | null {
    return this.currentModelId;
  }

  /** Human-readable name of the current model. */
  static getCurrentModelName(): string {
    if (!this.currentModelId) return 'None';
    for (const [key, id] of Object.entries(WHISPER_MODELS)) {
      if (id === this.currentModelId) return `Whisper ${key}`;
    }
    return this.currentModelId;
  }

  /** Unload the model to free memory. */
  static dispose(): void {
    this.instance = null;
    this.currentModelId = null;
    console.log('[WhisperBinding] Model disposed');
  }
}
