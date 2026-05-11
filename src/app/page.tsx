import { TranscriptionDashboard } from "@/features/transcription/TranscriptionDashboard";
import { RagSearchPanel } from "@/features/rag-engine/RagSearchPanel";
import { ModelManager } from "@/features/model-manager/ModelManager";
import { Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl mx-auto mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-medium border border-indigo-500/20 mb-6">
          <Sparkles className="w-4 h-4" />
          <span>Powered by Transformers.js & WebGPU</span>
        </div>
        
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Spirit Echo
          </span>
        </h1>
        <p className="text-xl text-gray-400 font-light max-w-2xl mx-auto">
          Private, real-time audio transcription and intelligence directly on your device.
        </p>
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 pb-16">
        <TranscriptionDashboard />
        <RagSearchPanel />
        <ModelManager />
      </div>
    </main>
  );
}
