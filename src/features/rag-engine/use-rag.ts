'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SearchResult } from '@/core/entities';

type RagStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useRag() {
  const [status, setStatus] = useState<RagStatus>('idle');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [documentCount, setDocumentCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const resolveInitRef = useRef<(() => void) | null>(null);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../../workers/rag-embedding.worker.ts', import.meta.url),
        { type: 'module' },
      );

      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
          case 'STATUS':
            setStatus(payload as RagStatus);
            if (payload === 'ready' && resolveInitRef.current) {
              resolveInitRef.current();
              resolveInitRef.current = null;
            }
            break;
          case 'INDEXED':
            // Refresh count after indexing
            workerRef.current?.postMessage({ type: 'COUNT' });
            break;
          case 'SEARCH_RESULTS':
            setSearchResults(payload as SearchResult[]);
            setIsSearching(false);
            break;
          case 'COUNT':
            setDocumentCount(payload as number);
            break;
          case 'DELETED':
            workerRef.current?.postMessage({ type: 'COUNT' });
            break;
          case 'ERROR':
            setError(payload as string);
            setIsSearching(false);
            break;
        }
      };
    }
    return workerRef.current;
  }, []);

  /** Initialize the RAG engine (LanceDB + embedding model). Returns when ready. */
  const initialize = useCallback(async (): Promise<void> => {
    if (status === 'ready') return;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = new Promise<void>((resolve) => {
      resolveInitRef.current = resolve;
      getWorker().postMessage({ type: 'INIT' });
    });

    await initPromiseRef.current;
  }, [status, getWorker]);

  /** Index a transcript or document into the vector store. */
  const indexDocument = useCallback(
    async (doc: {
      id: string;
      content: string;
      source?: string;
      sessionId?: string;
      metadata?: Record<string, string>;
    }): Promise<void> => {
      await initialize();
      getWorker().postMessage({ type: 'INDEX', payload: doc });
    },
    [initialize, getWorker],
  );

  /** Search the vector store for semantically similar documents. */
  const search = useCallback(
    async (query: string, limit: number = 5): Promise<SearchResult[]> => {
      await initialize();
      setIsSearching(true);
      setSearchResults([]);

      getWorker().postMessage({ type: 'SEARCH', payload: { query, limit } });

      // Wait for results via the onmessage handler
      return new Promise((resolve) => {
        const checkResults = setInterval(() => {
          if (!isSearching) {
            clearInterval(checkResults);
            // Results are already in state
            resolve(searchResults);
          }
        }, 100);
      });
    },
    [initialize, getWorker, isSearching, searchResults],
  );

  /** Delete a document from the vector store by ID. */
  const deleteDocument = useCallback(
    async (id: string): Promise<void> => {
      await initialize();
      getWorker().postMessage({ type: 'DELETE', payload: { id } });
    },
    [initialize, getWorker],
  );

  /** Refresh the document count. */
  const refreshCount = useCallback(() => {
    getWorker().postMessage({ type: 'COUNT' });
  }, [getWorker]);

  // Refresh count when initialized
  useEffect(() => {
    if (status === 'ready') {
      refreshCount();
    }
  }, [status, refreshCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return {
    status,
    searchResults,
    documentCount,
    error,
    isSearching,
    initialize,
    indexDocument,
    search,
    deleteDocument,
    refreshCount,
  };
}
