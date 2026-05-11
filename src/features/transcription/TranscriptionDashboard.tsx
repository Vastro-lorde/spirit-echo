'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Square, Loader2, Download, RefreshCw, AlertCircle, Cpu, Zap, Brain, ListTodo, MessageSquare, Sparkles } from 'lucide-react';
import { useTranscription } from './use-transcription';
import { useGemmaAnalysis } from './use-gemma-analysis';
import { BACKEND_LABELS } from '@/infrastructure/ai/backend-detection';
import { tauri } from '@/infrastructure/tauri-bridge';
import type { GemmaTask } from '@/infrastructure/ai/gemma-binding';

export function TranscriptionDashboard() {
  const {
    status,
    transcript,
    partialTranscript,
    progress,
    error,
    backend,
    loadModel,
    startRecording,
    stopRecording,
    setTranscript,
  } = useTranscription();

  const {
    status: gemmaStatus,
    result: gemmaResult,
    progress: gemmaProgress,
    error: gemmaError,
    loadModel: loadGemma,
    analyze,
  } = useGemmaAnalysis();

  const [gemmaQuestion, setGemmaQuestion] = useState('');
  const [showQaInput, setShowQaInput] = useState(false);

  const BackendIcon = backend === 'webgpu' ? Zap : Cpu;

  const runGemmaTask = (task: GemmaTask) => {
    if (!transcript.trim()) return;
    if (task === 'qa') {
      setShowQaInput(true);
      return;
    }
    analyze(transcript, task);
  };

  const submitQuestion = () => {
    if (!gemmaQuestion.trim() || !transcript.trim()) return;
    analyze(transcript, 'qa', gemmaQuestion.trim());
    setShowQaInput(false);
    setGemmaQuestion('');
  };

  const handleExport = async () => {
    await tauri.exportTranscript(
      transcript,
      `transcript-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-6 flex flex-col gap-8">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center justify-between gap-4 bg-black/40 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl"
      >
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
            Live Transcription
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Offline speech-to-text powered by WebGPU
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Backend indicator */}
          {status !== 'idle' && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              backend === 'webgpu'
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              <BackendIcon className="w-3 h-3" />
              <span>{BACKEND_LABELS[backend]}</span>
            </div>
          )}

          {status === 'idle' && (
            <button
              onClick={loadModel}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-full text-sm font-medium text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]"
            >
              <RefreshCw className="w-4 h-4" />
              Load AI Model
            </button>
          )}

          {status === 'loading' && (
            <div className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Downloading Weights... {progress?.progress ? Math.round(progress.progress) + '%' : ''}</span>
            </div>
          )}

          {status === 'ready' && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 transition-colors rounded-full text-sm font-medium"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </button>
          )}

          {status === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 transition-colors rounded-full text-sm font-medium text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop Recording
            </button>
          )}
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong className="block font-semibold mb-1">System Error</strong>
            {error}
          </div>
        </motion.div>
      )}

      {/* Main Transcript Area */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative flex-1 min-h-[400px] bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">
              {status === 'recording' ? 'Live Transcript' : 'Transcript Output'}
            </span>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setTranscript('')}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Clear Transcript"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Export as Text"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          {transcript || partialTranscript ? (
            <p className="text-lg leading-relaxed font-light whitespace-pre-wrap">
              <span className="text-gray-200">{transcript}</span>
              {partialTranscript && (
                <span className="text-gray-400 ml-1 italic">{partialTranscript}</span>
              )}
            </p>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4">
              <Mic className="w-12 h-12 opacity-20" />
              <p className="text-sm">No transcription data yet.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Gemma Intelligence Panel ─────────────────────────────── */}
      {transcript.trim() && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">
                Gemma Intelligence
              </span>
            </div>
            <div className="flex items-center gap-2">
              {gemmaStatus === 'loading' && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading Gemma...
                </span>
              )}
              {gemmaStatus === 'analyzing' && (
                <span className="text-xs text-purple-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {!gemmaStatus || gemmaStatus === 'idle' ? (
                <button
                  onClick={loadGemma}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 transition-colors rounded-full text-sm font-medium text-white"
                >
                  <Brain className="w-4 h-4" />
                  Load Gemma Model
                </button>
              ) : (
                <>
                  <button
                    onClick={() => runGemmaTask('summarize')}
                    disabled={gemmaStatus === 'analyzing'}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-300 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Summarize
                  </button>
                  <button
                    onClick={() => runGemmaTask('extract-actions')}
                    disabled={gemmaStatus === 'analyzing'}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-300 transition-colors disabled:opacity-50"
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                    Extract Actions
                  </button>
                  <button
                    onClick={() => runGemmaTask('qa')}
                    disabled={gemmaStatus === 'analyzing'}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-300 transition-colors disabled:opacity-50"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ask Question
                  </button>
                </>
              )}
            </div>

            {/* QA input */}
            {showQaInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-4 flex gap-2"
              >
                <input
                  type="text"
                  value={gemmaQuestion}
                  onChange={(e) => setGemmaQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
                  placeholder="Ask a question about the transcript..."
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  autoFocus
                />
                <button
                  onClick={submitQuestion}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-medium text-white transition-colors"
                >
                  Ask
                </button>
              </motion.div>
            )}

            {/* Gemma error */}
            {gemmaError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 mb-4">
                {gemmaError}
              </div>
            )}

            {/* Gemma result */}
            {gemmaResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">
                    {gemmaResult.task === 'summarize' && 'Summary'}
                    {gemmaResult.task === 'extract-actions' && 'Action Items'}
                    {gemmaResult.task === 'qa' && 'Answer'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {gemmaResult.durationMs}ms
                  </span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {gemmaResult.result}
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
