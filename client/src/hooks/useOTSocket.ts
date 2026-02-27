import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { QuillDelta } from '../lib/ot-client';

interface UseOTSocketOptions {
  docId: string;
  token: string;
  onOperation: (op: QuillDelta, revision: number, userId: string) => void;
  onPresenceUpdate: (users: Array<{ userId: string; name: string; cursor?: number }>) => void;
  onDocumentLoaded: (content: string, revision: number) => void;
  onCursorUpdate: (userId: string, position: number) => void;
}

interface UseOTSocketReturn {
  sendOperation: (op: QuillDelta, revision: number) => void;
  sendCursorUpdate: (position: number) => void;
  isConnected: boolean;
  serverRevision: number;
}

/**
 * Custom hook that manages the Socket.io connection for real-time collaboration.
 * Handles document join, op submission, cursor updates, and presence tracking.
 */
export const useOTSocket = ({
  docId,
  token,
  onOperation,
  onPresenceUpdate,
  onDocumentLoaded,
  onCursorUpdate,
}: UseOTSocketOptions): UseOTSocketReturn => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [serverRevision, setServerRevision] = useState(0);

  useEffect(() => {
    const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const socket = io(SOCKET_URL, { 
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-document', { docId, token });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('document-loaded', ({ content, revision }: { content: string; revision: number }) => {
      setServerRevision(revision);
      onDocumentLoaded(content, revision);
    });

    socket.on('receive-operation', ({ op, revision, userId }: { op: QuillDelta; revision: number; userId: string }) => {
      setServerRevision(revision);
      onOperation(op, revision, userId);
    });

    socket.on('operation-ack', ({ revision }: { revision: number }) => {
      setServerRevision(revision);
    });

    socket.on('operation-rejected', ({ reason }: { reason: string }) => {
      // On rejection, re-fetch the latest document state
      console.warn('Operation rejected:', reason);
      socket.emit('join-document', { docId, token }); // re-sync
    });

    socket.on('presence-update', ({ users }: { users: Array<{ userId: string; name: string; cursor?: number }> }) => {
      onPresenceUpdate(users);
    });

    socket.on('cursor-update', ({ userId, position }: { userId: string; position: number }) => {
      onCursorUpdate(userId, position);
    });

    return () => {
      socket.disconnect();
    };
  }, [docId, token]);

  const sendOperation = useCallback((op: QuillDelta, revision: number) => {
    socketRef.current?.emit('send-operation', { docId, op, revision, token });
  }, [docId, token]);

  const sendCursorUpdate = useCallback((position: number) => {
    socketRef.current?.emit('cursor-update', { docId, position, token });
  }, [docId, token]);

  return { sendOperation, sendCursorUpdate, isConnected, serverRevision };
};
