'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Database, Loader2, Trash2, AlertCircle, BookOpen } from 'lucide-react';
import { useRag } from './use-rag';

interface RagSearchPanelProps {
  /** Called when a transcript should be indexed (e.g., on stop recording). */
  onIndexTranscript?: (indexFn: (content: string, id: string) => Promise<void>) => void;
}

export function RagSearchPanel({ onIndexTranscript }: RagSearchPanelProps) {
  const {
    status,
    searchResults,
    documentCount,
    error,
    isSearching,
    initialize,
    indexDocument,
    search,
    deleteDocument,
  } = useRag();

  const [query, setQuery] = useState('');

  useEffect(() => {
    // Lazy-initialize RAG on first mount
    if (status === 'idle') {
      initialize();
    }
  }, [status, initialize]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await search(query.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
    >
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">
            Semantic Search
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {documentCount} document{documentCount !== 1 ? 's' : ''} indexed
          </span>
          {status === 'loading' && (
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your transcripts..."
            className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-colors flex items-center gap-1.5"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {searchResults.map((result) => (
                <motion.div
                  key={result.document.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-white/5 border border-white/10 rounded-xl group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 leading-relaxed line-clamp-3">
                        {result.snippet}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-500">
                          Score: {(result.score * 100).toFixed(0)}%
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {result.document.source}
                        </span>
                        <span className="text-xs text-gray-600">
                          {new Date(result.document.indexedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDocument(result.document.id)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete from index"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!isSearching && searchResults.length === 0 && documentCount === 0 && status === 'ready' && (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-600">
            <BookOpen className="w-8 h-8 opacity-30" />
            <p className="text-xs">No transcripts indexed yet.</p>
            <p className="text-xs">Transcripts will appear here after recording.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Convenience function to index a transcript from the dashboard. */
export async function indexTranscriptContent(
  indexFn: (doc: { id: string; content: string; source?: string; sessionId?: string }) => Promise<void>,
  content: string,
  sessionId?: string,
): Promise<void> {
  if (!content.trim()) return;
  const id = `transcript-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await indexFn({
    id,
    content,
    source: 'transcript',
    sessionId,
  });
}
