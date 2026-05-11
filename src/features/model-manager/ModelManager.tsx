'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  HardDrive,
  Trash2,
  Download,
  CheckCircle,
  Loader2,
  Cpu,
  Zap,
  Box,
} from 'lucide-react';
import { useModelManager } from './use-model-manager';
import { BACKEND_LABELS } from '@/infrastructure/ai/backend-detection';
import type { ModelConfig } from '@/core/entities';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ModelCard({ model, onDelete }: { model: ModelConfig; onDelete: (id: string) => void }) {
  const isCached = model.cacheStatus === 'cached';

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg ${isCached ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
          <Box className={`w-5 h-5 ${isCached ? 'text-emerald-400' : 'text-gray-500'}`} />
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-gray-200 truncate">{model.displayName}</h4>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-500 capitalize">{model.task.replace(/-/g, ' ')}</span>
            <span className="text-xs text-gray-600">{formatBytes(model.sizeBytes)}</span>
            {isCached ? (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle className="w-3 h-3" />
                Cached
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Download className="w-3 h-3" />
                Not downloaded
              </span>
            )}
          </div>
        </div>
      </div>

      {isCached && (
        <button
          onClick={() => onDelete(model.modelId)}
          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors shrink-0"
          title="Delete cached model"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function ModelManager() {
  const { models, totalCacheBytes, backend, loading, deleteModel, clearAllCache } = useModelManager();

  const BackendIcon = backend === 'webgpu' ? Zap : Cpu;
  const cachedCount = models.filter((m) => m.cacheStatus === 'cached').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
    >
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">
            Model Manager
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs ${backend === 'webgpu' ? 'text-green-400' : 'text-amber-400'}`}>
            <BackendIcon className="w-3 h-3" />
            {BACKEND_LABELS[backend]}
          </div>
          <span className="text-xs text-gray-500">
            {cachedCount}/{models.length} cached · {formatBytes(totalCacheBytes)}
          </span>
          {cachedCount > 0 && (
            <button
              onClick={clearAllCache}
              className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {models.map((model) => (
              <ModelCard key={model.modelId} model={model} onDelete={deleteModel} />
            ))}
          </div>
        )}

        <p className="text-xs text-gray-600 mt-4 text-center">
          Models are downloaded on first use and cached locally in your browser.
          No data leaves your device.
        </p>
      </div>
    </motion.div>
  );
}
