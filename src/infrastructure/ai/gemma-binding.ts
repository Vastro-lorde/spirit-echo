// ─── Gemma Model Binding ────────────────────────────────────────────
// Loads Google Gemma (or any compatible text-generation model) via
// HuggingFace Transformers.js for on-device post-transcription intelligence.
// Supports summarization, Q&A, and action-item extraction.

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

/** Default configuration using Gemma 2 2B Instruct (Xenova-converted). */
export const DEFAULT_GEMMA_CONFIG: GemmaConfig = {
  modelId: 'Xenova/gemma-2-2b-it',
  maxNewTokens: 256,
  temperature: 0.3,
  topP: 0.9,
};

/** Prompt templates for each analysis task. */
const TASK_PROMPTS: Record<GemmaTask, (transcript: string) => string> = {
  summarize: (t) =>
    `<start_of_turn>user\nSummarize the following transcript concisely in 3-5 bullet points:\n\n${t}\n<end_of_turn>\n<start_of_turn>model\n`,
  'extract-actions': (t) =>
    `<start_of_turn>user\nExtract all action items, tasks, and decisions from this transcript. Output as a bulleted list:\n\n${t}\n<end_of_turn>\n<start_of_turn>model\n`,
  qa: (t) =>
    `<start_of_turn>user\nAnswer the following question based on the transcript below. If the answer is not in the transcript, say so.\n\nTranscript:\n${t}\n<end_of_turn>\n<start_of_turn>model\n`,
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
      this.instance = await pipeline('text-generation', this.config.modelId, {
        progress_callback: progressCallback,
        device: 'webgpu',
      });
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
      prompt = TASK_PROMPTS.qa(transcript).replace(
        'Answer the following question',
        `Question: ${question}\n\nAnswer`,
      );
    } else {
      prompt = TASK_PROMPTS[task](transcript);
    }

    const outputs = await model(prompt, {
      max_new_tokens: this.config.maxNewTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
    });

    const durationMs = Math.round(performance.now() - startedAt);

    // Extract generated text (first output's generated_text minus the prompt)
    const raw = (outputs as any)[0]?.generated_text ?? '';
    const result = raw.replace(prompt, '').trim();

    return { task, result, durationMs };
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
