export class AudioStreamController {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onAudioData: (data: Float32Array) => void;

  constructor(onAudioData: (data: Float32Array) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Standard sample rate for Whisper models
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      await this.audioContext.audioWorklet.addModule('/audio-worklet.js');

      this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      this.workletNode.port.onmessage = (event) => {
        this.onAudioData(event.data);
      };

      this.audioSource.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

    } catch (error) {
      console.error('Error starting audio stream:', error);
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
