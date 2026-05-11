import { pipeline, env } from '@huggingface/transformers';

// Keep local models disabled by default since we are loading via the browser
env.allowLocalModels = false;

// Optional: Enable WASM backend if WebGPU is not strictly available. 
// Transformers.js handles fallback automatically, but you can configure environments here.

export class WhisperBinding {
  private static instance: any = null;

  static async getInstance(progressCallback?: (info: any) => void) {
    if (!this.instance) {
      // Load the Whisper Tiny model for English by default.
      // This will download the ONNX weights into the browser's OPFS cache.
      this.instance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        progress_callback: progressCallback,
        device: 'webgpu', // Will fallback to wasm if webgpu not available on host
      });
    }
    return this.instance;
  }
}
