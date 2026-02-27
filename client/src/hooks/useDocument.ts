import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface Document {
  _id: string;
  title: string;
  content: string;
  revision: number;
  ownerId: string;
  collaborators: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook for fetching and managing a single document via REST.
 */
export const useDocument = (docId: string) => {
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get(`/documents/${docId}`);
      setDocument(res.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const updateTitle = async (title: string) => {
    const res = await api.patch(`/documents/${docId}`, { title });
    setDocument(res.data);
  };

  return { document, isLoading, error, refetch: fetchDocument, updateTitle };
};
