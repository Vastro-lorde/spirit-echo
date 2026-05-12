export class AudioStreamController {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onAudioData: (data: Float32Array) => void;
  private chunkCount = 0;

  constructor(onAudioData: (data: Float32Array) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Request 16kHz for Whisper
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Verify what sample rate we actually got
      const audioTrack = this.mediaStream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();
      console.log(
        `[AudioStreamController] Mic opened — sampleRate: ${settings.sampleRate}Hz, ` +
        `channels: ${settings.channelCount}, deviceId: ${settings.deviceId?.slice(0, 8)}...`,
      );

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      console.log(
        `[AudioStreamController] AudioContext — sampleRate: ${this.audioContext.sampleRate}Hz, ` +
        `state: ${this.audioContext.state}`,
      );

      await this.audioContext.audioWorklet.addModule('/audio-worklet.js');

      this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      this.chunkCount = 0;
      this.workletNode.port.onmessage = (event) => {
        this.chunkCount++;
        if (this.chunkCount === 1) {
          // Log first chunk to confirm audio is flowing
          const samples = event.data as Float32Array;
          let sumSq = 0;
          for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
          const rms = Math.sqrt(sumSq / samples.length);
          console.log(
            `[AudioStreamController] First audio chunk — ${samples.length} samples, ` +
            `RMS: ${rms.toFixed(4)}`,
          );
        }
        if (this.chunkCount % 50 === 0) {
          console.log(`[AudioStreamController] ${this.chunkCount} chunks received`);
        }
        this.onAudioData(event.data);
      };

      this.audioSource.connect(this.workletNode);
      // Don't connect to destination — we don't want echo/feedback
      // this.workletNode.connect(this.audioContext.destination);

    } catch (error) {
      console.error('[AudioStreamController] Error starting audio stream:', error);
      throw error;
    }
  }

  stop() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
