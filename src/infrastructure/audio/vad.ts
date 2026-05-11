// ─── Voice Activity Detection ───────────────────────────────────────
// Lightweight RMS-energy-based VAD for real-time audio streaming.
// Operates on 16kHz mono Float32Array PCM data.

/** Configuration for the VAD module. */
export interface VadConfig {
  /** RMS energy threshold below which audio is considered silence (0-1). */
  energyThreshold: number;
  /** Minimum duration of continuous speech (ms) before VAD triggers. */
  speechStartPaddingMs: number;
  /** Duration of silence (ms) after which speech is considered ended. */
  speechEndPaddingMs: number;
  /** Whether to output debug logs (for development). */
  debug?: boolean;
}

/** VAD state enum. */
export type VadState = 'silence' | 'speech';

/** Default VAD configuration tuned for Whisper transcription. */
export const DEFAULT_VAD_CONFIG: VadConfig = {
  energyThreshold: 0.01,       // RMS > 0.01 = speech
  speechStartPaddingMs: 200,    // 200ms of sustained speech to trigger
  speechEndPaddingMs: 600,      // 600ms of silence to end speech
  debug: false,
};

/**
 * Lightweight Voice Activity Detector.
 * Uses RMS (Root Mean Square) energy to distinguish speech from silence.
 *
 * Usage:
 *   const vad = new VoiceActivityDetector();
 *   vad.processChunk(audioSamples); // returns 'speech' | 'silence'
 *   vad.isSpeaking();               // true if currently in speech segment
 */
export class VoiceActivityDetector {
  private config: VadConfig;
  private state: VadState = 'silence';
  private speechSamples: number = 0;
  private silenceSamples: number = 0;
  private readonly sampleRate: number;

  constructor(config: Partial<VadConfig> = {}, sampleRate: number = 16000) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.sampleRate = sampleRate;
  }

  /**
   * Compute RMS energy of an audio buffer.
   * Returns a value in [0, 1] for normalized float data.
   */
  static computeRMS(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    return Math.sqrt(sumSq / samples.length);
  }

  /**
   * Process a chunk of audio samples and return the current VAD state.
   * Maintains internal hysteresis to avoid flickering.
   */
  processChunk(samples: Float32Array): VadState {
    const rms = VoiceActivityDetector.computeRMS(samples);
    const isSpeech = rms > this.config.energyThreshold;
    const chunkDurationMs = (samples.length / this.sampleRate) * 1000;

    if (isSpeech) {
      this.speechSamples += samples.length;
      this.silenceSamples = 0;

      const speechDurationMs = (this.speechSamples / this.sampleRate) * 1000;
      if (speechDurationMs >= this.config.speechStartPaddingMs && this.state === 'silence') {
        this.state = 'speech';
        if (this.config.debug) {
          console.debug(`[VAD] Speech started (energy: ${rms.toFixed(4)})`);
        }
      }
    } else {
      this.silenceSamples += samples.length;
      // Don't reset speech counter immediately — allow brief pauses
      const silenceDurationMs = (this.silenceSamples / this.sampleRate) * 1000;
      if (silenceDurationMs >= this.config.speechEndPaddingMs && this.state === 'speech') {
        this.state = 'silence';
        this.speechSamples = 0;
        if (this.config.debug) {
          console.debug(`[VAD] Speech ended (silence: ${silenceDurationMs.toFixed(0)}ms)`);
        }
      }
    }

    return this.state;
  }

  /** Returns true if currently in a speech segment. */
  isSpeaking(): boolean {
    return this.state === 'speech';
  }

  /** Returns the current VAD state. */
  getState(): VadState {
    return this.state;
  }

  /** Reset VAD state (call when starting a new recording session). */
  reset(): void {
    this.state = 'silence';
    this.speechSamples = 0;
    this.silenceSamples = 0;
  }

  /** Update VAD configuration at runtime. */
  updateConfig(config: Partial<VadConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
