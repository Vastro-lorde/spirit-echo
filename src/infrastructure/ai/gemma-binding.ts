// ─── LLM Analysis Binding ───────────────────────────────────────────
// Loads Gemma 3 270M (ONNX-converted, public, no auth required) via
// HuggingFace Transformers.js for on-device post-transcription intelligence.
// Supports summarization, Q&A, and action-item extraction.
//
// Model: onnx-community/gemma-3-270m-it-ONNX (~300MB q4, license: gemma)

import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

/** Supported analysis tasks that Gemma can perform on transcripts. */
export type GemmaTask = 'summarize' | 'extract-actions' | 'qa';

/** Result of a Gemma analysis run. */
export interface GemmaAnalysisResult {
  task: GemmaTask;
  result: string;
  /** Time taken in ms. */
  durationMs: number;
}

/** Configuration for the Gemma model binding. */
export interface GemmaConfig {
  /** HuggingFace model ID (must be ONNX-converted for Transformers.js). */
  modelId: string;
  /** Maximum new tokens to generate. */
  maxNewTokens: number;
  /** Temperature for sampling (0-1, lower = more deterministic). */
  temperature: number;
  /** Top-p nucleus sampling. */
  topP: number;
}

/** Default configuration using Gemma 3 270M Instruct ONNX (public, no auth required). */
export const DEFAULT_GEMMA_CONFIG: GemmaConfig = {
  modelId: 'onnx-community/gemma-3-270m-it-ONNX',
  maxNewTokens: 256,
  temperature: 0.3,
  topP: 0.9,
};

/** Prompt templates for each analysis task (Gemma 3 instruct format). */
const TASK_PROMPTS: Record<GemmaTask, (transcript: string) => string> = {
  summarize: (t) =>
    `<bos><start_of_turn>user\nSummarize the following transcript concisely in 3-5 bullet points:\n\n${t}<end_of_turn>\n<start_of_turn>model\n`,
  'extract-actions': (t) =>
    `<bos><start_of_turn>user\nExtract all action items, tasks, and decisions from this transcript. Output as a bulleted list:\n\n${t}<end_of_turn>\n<start_of_turn>model\n`,
  qa: (t) =>
    `<bos><start_of_turn>user\nAnswer the following question based on the transcript below. If the answer is not in the transcript, say so.\n\nTranscript:\n${t}<end_of_turn>\n<start_of_turn>model\n`,
};

export class GemmaBinding {
  private static instance: any = null;
  private static currentModelId: string | null = null;
  private static config: GemmaConfig = DEFAULT_GEMMA_CONFIG;

  /**
   * Get or create the Gemma pipeline singleton.
   * Downloads the model on first call (cached to OPFS thereafter).
   */
  static async getInstance(
    progressCallback?: (info: any) => void,
    config?: Partial<GemmaConfig>,
  ): Promise<any> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Re-initialize if model ID changed
    if (this.instance && this.currentModelId !== this.config.modelId) {
      this.instance = null;
      this.currentModelId = null;
    }

    if (!this.instance) {
      // Try WebGPU first; fall back to WASM if not supported or model lacks GPU files
      try {
        this.instance = await pipeline('text-generation', this.config.modelId, {
          progress_callback: progressCallback,
          device: 'webgpu',
        });
      } catch {
        console.warn('[GemmaBinding] WebGPU unavailable, falling back to WASM');
        this.instance = await pipeline('text-generation', this.config.modelId, {
          progress_callback: progressCallback,
          device: 'wasm',
        });
      }
      this.currentModelId = this.config.modelId;
    }
    return this.instance;
  }

  /**
   * Run a Gemma analysis task on a transcript.
   *
   * @param transcript - The full transcript text to analyze.
   * @param task - The type of analysis to perform.
   * @param question - Required when task is 'qa'; the question to answer.
   */
  static async analyze(
    transcript: string,
    task: GemmaTask,
    question?: string,
  ): Promise<GemmaAnalysisResult> {
    const startedAt = performance.now();
    const model = await this.getInstance();

    let prompt: string;
    if (task === 'qa' && question) {
      prompt = `<bos><start_of_turn>user\nAnswer the following question based on the transcript below. If the answer is not in the transcript, say so.\n\nTranscript:\n${transcript}\n\nQuestion: ${question}<end_of_turn>\n<start_of_turn>model\n`;
    } else {
      prompt = TASK_PROMPTS[task](transcript);
    }

    const outputs = await model(prompt, {
      max_new_tokens: this.config.maxNewTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
    });

    const durationMs = Math.round(performance.now() - startedAt);

    // Extract generated text — Gemma 3 returns 0th element's generated_text
    const raw: string = (outputs as any)[0]?.generated_text ?? '';

    // Strip the prompt to get just the response
    const result = raw.startsWith(prompt) ? raw.slice(prompt.length).trim() : raw.trim();

    // Strip trailing <end_of_turn> and any trailing <eos>
    const cleaned = result.replace(/<end_of_turn>\s*$/, '').replace(/<eos>\s*$/, '').trim();

    return { task, result: cleaned, durationMs };
  }

  /**
   * Check whether the Gemma model is loaded.
   */
  static isLoaded(): boolean {
    return this.instance !== null;
  }

  /**
   * Unload the model to free memory.
   */
  static dispose(): void {
    this.instance = null;
    this.currentModelId = null;
  }
}
