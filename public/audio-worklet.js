class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Use a buffer to collect chunks of audio data to send to the main thread
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex] = channelData[i];
        this.bufferIndex++;

        if (this.bufferIndex >= this.bufferSize) {
          // Send the chunk to the main thread
          this.port.postMessage(this.buffer);
          // Create a new buffer to avoid transferring issues
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
