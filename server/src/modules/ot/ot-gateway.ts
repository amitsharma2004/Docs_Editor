import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/auth.service';
import { getDocumentById, applyOperationToDocument } from '../document/document.service';
import { transformOperation, applyOperation, Operation } from './ot-engine';
import { Op } from './op.model';
import { getRedisClient } from '../../config/redis';
import { writeLog } from '../../utils/logger';
import { Types } from 'mongoose';

const REDIS_OP_TTL = 30; // seconds

/**
 * Buffer an in-flight operation in Redis.
 */
const bufferOp = async (docId: string, op: Operation): Promise<void> => {
  const redis = getRedisClient();
  const key = `ops:${docId}`;
  await redis.lpush(key, JSON.stringify(op));
  await redis.expire(key, REDIS_OP_TTL);
};

/**
 * Get buffered ops from Redis for a document since a given revision.
 */
const getBufferedOps = async (docId: string, sinceRevision: number): Promise<Operation[]> => {
  const redis = getRedisClient();
  const key = `ops:${docId}`;
  const raw = await redis.lrange(key, 0, -1);
  return raw
    .map((r) => JSON.parse(r) as Operation)
    .filter((op) => op.revision > sinceRevision);
};

/**
 * Flush buffered ops from Redis to MongoDB.
 */
const flushOpsToMongo = async (docId: string): Promise<void> => {
  const redis = getRedisClient();
  const key = `ops:${docId}`;
  const raw = await redis.lrange(key, 0, -1);
  if (raw.length === 0) return;

  const ops = raw.map((r) => JSON.parse(r) as Operation);
  const docs = ops.map((op) => ({
    docId: new Types.ObjectId(op.docId),
    userId: new Types.ObjectId(op.userId),
    op: JSON.stringify(op.op),
    revision: op.revision,
  }));

  await Op.insertMany(docs, { ordered: false });
  await redis.del(key);
  writeLog('info', `Flushed ${docs.length} ops to MongoDB for doc ${docId}`);
};

/** Track presence per document room: Map<docId, Map<socketId, userInfo>> */
const presenceMap = new Map<string, Map<string, { userId: string; name: string; cursor?: number }>>();

/**
 * Register all Socket.io event handlers for the OT collaboration layer.
 */
export const registerOTGateway = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    writeLog('info', `Socket connected: ${socket.id}`);

    // ── JOIN DOCUMENT ──────────────────────────────────────────────────────
    socket.on('join-document', async ({ docId, token }: { docId: string; token: string }) => {
      try {
        const payload = verifyAccessToken(token);
        const doc = await getDocumentById(docId, payload.userId);

        await socket.join(docId);

        // Track presence
        if (!presenceMap.has(docId)) presenceMap.set(docId, new Map());
        presenceMap.get(docId)!.set(socket.id, { userId: payload.userId, name: payload.email });

        // Broadcast updated presence list
        const users = Array.from(presenceMap.get(docId)!.values());
        io.to(docId).emit('presence-update', { users });

        // Send current document state to joining client
        socket.emit('document-loaded', {
          content: doc.content,
          revision: doc.revision,
          docId: doc._id,
          title: doc.title,
        });

        writeLog('info', `User ${payload.userId} joined document ${docId}`);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── SEND OPERATION ─────────────────────────────────────────────────────
    socket.on('send-operation', async ({ docId, op, revision, token }: {
      docId: string;
      op: Operation['op'];
      revision: number;
      token: string;
    }) => {
      try {
        const payload = verifyAccessToken(token);
        const doc = await getDocumentById(docId, payload.userId);

        const clientOp: Operation = { op, revision, userId: payload.userId, docId };

        // Get pending ops since client's revision (from Redis buffer)
        const pendingOps = await getBufferedOps(docId, revision);

        // Transform the client op against pending server ops
        const { transformedOp, newRevision } = transformOperation(clientOp, pendingOps);

        // Apply transformed op to document content
        const newContent = applyOperation(doc.content, transformedOp);

        // Atomically update document with CAS on revision
        const updatedDoc = await applyOperationToDocument(docId, newContent, doc.revision);
        if (!updatedDoc) {
          // Revision mismatch — retry by rejecting and asking client to re-sync
          socket.emit('operation-rejected', { docId, reason: 'revision_conflict' });
          return;
        }

        const serverOp: Operation = { op: transformedOp, revision: updatedDoc.revision, userId: payload.userId, docId };

        // Buffer in Redis
        await bufferOp(docId, serverOp);

        // Broadcast transformed op to all OTHER clients in the room
        socket.to(docId).emit('receive-operation', {
          op: transformedOp,
          revision: updatedDoc.revision,
          userId: payload.userId,
        });

        // Acknowledge to sender
        socket.emit('operation-ack', { revision: updatedDoc.revision });

        // Notify room of save
        io.to(docId).emit('document-saved', {
          revision: updatedDoc.revision,
          timestamp: new Date().toISOString(),
        });

      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── CURSOR UPDATE ──────────────────────────────────────────────────────
    socket.on('cursor-update', ({ docId, position, token }: {
      docId: string;
      position: number;
      token: string;
    }) => {
      try {
        const payload = verifyAccessToken(token);
        const presence = presenceMap.get(docId);
        if (presence?.has(socket.id)) {
          presence.get(socket.id)!.cursor = position;
        }
        socket.to(docId).emit('cursor-update', { userId: payload.userId, position });
      } catch { /* ignore invalid cursor events */ }
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnecting', async () => {
      for (const room of socket.rooms) {
        if (room === socket.id) continue;

        // Remove from presence
        presenceMap.get(room)?.delete(socket.id);

        // Flush buffered ops to MongoDB on last user leaving
        const remaining = presenceMap.get(room)?.size ?? 0;
        if (remaining === 0) {
          await flushOpsToMongo(room);
          presenceMap.delete(room);
        } else {
          const users = Array.from(presenceMap.get(room)!.values());
          io.to(room).emit('presence-update', { users });
        }
      }
      writeLog('info', `Socket disconnected: ${socket.id}`);
    });
  });
};
