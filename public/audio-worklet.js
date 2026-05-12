class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Log the actual sample rate the worklet is running at
    console.log(`[AudioWorklet] Processor created — sampleRate: ${sampleRate}Hz`);
    // Use a buffer to collect chunks of audio data to send to the main thread
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.chunkCount = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex] = channelData[i];
        this.bufferIndex++;

        if (this.bufferIndex >= this.bufferSize) {
          // Transfer ownership of the buffer for zero-copy
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          // Create a new buffer
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
          this.chunkCount++;
        }
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
