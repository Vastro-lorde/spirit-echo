# spirit-echo: Offline Real-Time AI Transcription & RAG Stack
**Architecture & Software Requirements Specification**

---

## 1. Software Requirements Specification (SRS)

### 1.1 Functional Requirements
* **Offline Inference:** Transcribe live microphone audio directly on the client device without any network requests.
* **Real-Time Processing:** Provide visual feedback of transcription with a latency of <200ms using chunked audio processing.
* **Model Management:** Include a dedicated dashboard/UI to download, cache, verify, or delete AI model weights (e.g., Gemma 4 E2B, Whisper ONNX).
* **Local RAG Search:** Enable semantic search over past transcriptions and uploaded documents using an embedded vector database.
* **Export & Synchronization:** Allow users to export transcripts as Markdown/JSON and optionally sync encrypted backups to local file systems or cloud storage.

### 1.2 Non-Functional Requirements
* **Privacy:** Zero data transmission; all audio processing and vector embeddings must happen strictly on the local machine.
* **Performance:** Utilize **WebGPU** via ONNX Runtime Web or MediaPipe to achieve near-native execution speeds.
* **Resilience & Fallback:** Gracefully degrade to WebAssembly (Wasm) CPU execution if WebGPU is unavailable on the host device.
* **Memory Management:** Implement aggressive garbage collection and buffer flushing for audio streams to prevent browser tab crashes (especially on mobile devices with limited RAM).

---

## 2. Project Structure (Hexagonal / Clean Architecture)

This Next.js project is structured using a Feature-First Hexagonal architecture, cleanly separating UI components from heavy AI logic and storage adapters.
```text
spirit-echo/
├── public/                 # Static assets, Web Worker files, & Model manifests
├── src/
│   ├── app/                # Next.js App Router (UI Routes and Pages)
│   ├── core/               # Domain Logic & Interfaces (Business Rules)
│   │   ├── entities/       # Type definitions (Transcript, ModelConfig, Chunk)
│   │   └── use-cases/      # Application logic (StartTranscription, SearchHistory)
│   ├── features/           # Grouped by feature (Encapsulated Modules)
│   │   ├── transcription/  # UI, Components, and custom Hooks for recording
│   │   ├── rag-engine/     # LanceDB vector logic and Gemma 4 integration
│   │   └── model-manager/  # Downloading, OPFS caching, and weight management
│   ├── infrastructure/     # External Adapters (The "Outer Hexagon")
│   │   ├── ai/             # Whisper/Gemma model bindings (Transformers.js)
│   │   ├── db/             # LanceDB Wasm or IndexedDB adapters
│   │   └── audio/          # AudioWorklet and MediaDevices Stream controllers
│   ├── shared/             # Reusable UI Components (Tailwind/shadcn), Utils
│   └── workers/            # Background Processing (The "Engine" room)
│       ├── transcription.worker.ts
│       └── rag-embedding.worker.ts
├── next.config.mjs         # Contains COOP/COEP headers for SharedArrayBuffer
└── tsconfig.json