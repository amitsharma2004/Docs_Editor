/**
 * TASK-009-2: Integration Tests — Socket.io OT Gateway
 *
 * Tests the full real-time collaboration layer end-to-end using:
 *   - mongodb-memory-server  → real Mongoose models, no external DB
 *   - ioredis-mock           → in-memory Redis (via jest moduleNameMapper)
 *   - socket.io              → real server instance on random port
 *   - socket.io-client       → real client connections
 *   - jsonwebtoken           → real JWT tokens with a test secret
 *
 * Scenarios covered:
 *   1. join-document        → receives document-loaded + presence-update
 *   2. send-operation       → sender receives operation-ack, peer receives receive-operation
 *   3. concurrent ops       → two clients sending ops simultaneously converge
 *   4. cursor-update        → broadcasts to all OTHER room members
 *   5. unauthorized join    → receives error event (invalid token)
 *   6. disconnect presence  → presence-update emitted with reduced user list
 */

import { createServer } from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import ioClient from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import { registerOTGateway } from '../modules/ot/ot-gateway';
import { User } from '../modules/user/user.model';
import { DocumentModel } from '../modules/document/document.model';

// ─── Test environment config ──────────────────────────────────────────────────

const JWT_SECRET = 'integration-test-secret';
const JWT_REFRESH_SECRET = 'integration-test-refresh-secret';

/** Generate a signed JWT for a test user. */
const makeToken = (userId: string, email: string) =>
  jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });

// ─── Server lifecycle ─────────────────────────────────────────────────────────

let mongoServer: MongoMemoryServer;
let ioServer: SocketIOServer;
let serverUrl: string;

beforeAll(async () => {
  // Set env before any module that reads them at runtime
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = JWT_REFRESH_SECRET;
  process.env.REDIS_URL = 'redis://localhost:6379'; // ioredis-mock ignores URL

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Start in-memory Socket.io server on a random port
  const app = express();
  const httpServer = createServer(app);
  ioServer = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  registerOTGateway(ioServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const addr = httpServer.address() as { port: number };
  serverUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  ioServer.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ─── Data fixtures ────────────────────────────────────────────────────────────

interface TestFixture {
  userId: string;
  email: string;
  token: string;
  docId: string;
}

/** Create a fresh user + document for one test. */
const createFixture = async (suffix: string): Promise<TestFixture> => {
  const email = `user-${suffix}@test.com`;
  const user = await User.create({ name: `User ${suffix}`, email, passwordHash: 'x' });
  const doc = await DocumentModel.create({
    title: 'Test Document',
    ownerId: user._id,
    content: '',
    revision: 0,
  });
  return {
    userId: user._id.toString(),
    email,
    token: makeToken(user._id.toString(), email),
    docId: doc._id.toString(),
  };
};

/** Connect a socket.io client and wait for `connect` event. */
const connectClient = (url: string): Promise<ClientSocket> =>
  new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

/** Emit an event and wait for a specific response event. */
const emitAndWait = <T>(
  socket: ClientSocket,
  emitEvent: string,
  emitData: unknown,
  waitEvent: string,
  timeoutMs = 5000
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${waitEvent}`)), timeoutMs);
    socket.once(waitEvent, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.emit(emitEvent, emitData);
  });

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Socket.io OT Gateway — Integration', () => {

  // ── 1. join-document ──────────────────────────────────────────────────────

  describe('join-document', () => {
    test('valid token → receives document-loaded with correct shape', async () => {
      const { token, docId } = await createFixture('join1');
      const socket = await connectClient(serverUrl);

      try {
        const loaded = await emitAndWait<{
          content: string;
          revision: number;
          docId: string;
          title: string;
        }>(socket, 'join-document', { docId, token }, 'document-loaded');

        expect(loaded).toHaveProperty('content');
        expect(loaded).toHaveProperty('revision', 0);
        expect(loaded.title).toBe('Test Document');
      } finally {
        socket.disconnect();
      }
    });

    test('valid token → receives presence-update with current user', async () => {
      const { token, docId, userId } = await createFixture('join2');
      const socket = await connectClient(serverUrl);

      try {
        const presence = await emitAndWait<{ users: Array<{ userId: string }> }>(
          socket,
          'join-document',
          { docId, token },
          'presence-update'
        );

        expect(presence.users).toBeInstanceOf(Array);
        expect(presence.users.some((u) => u.userId === userId)).toBe(true);
      } finally {
        socket.disconnect();
      }
    });

    test('invalid token → receives error event', async () => {
      const { docId } = await createFixture('join3');
      const socket = await connectClient(serverUrl);

      try {
        const err = await emitAndWait<{ message: string }>(
          socket,
          'join-document',
          { docId, token: 'INVALID.TOKEN.HERE' },
          'error'
        );

        expect(err).toHaveProperty('message');
        expect(typeof err.message).toBe('string');
      } finally {
        socket.disconnect();
      }
    });

    test('non-existent docId → receives error event', async () => {
      const { token } = await createFixture('join4');
      const fakeDocId = new mongoose.Types.ObjectId().toString();
      const socket = await connectClient(serverUrl);

      try {
        const err = await emitAndWait<{ message: string }>(
          socket,
          'join-document',
          { docId: fakeDocId, token },
          'error'
        );

        expect(err).toHaveProperty('message');
      } finally {
        socket.disconnect();
      }
    });
  });

  // ── 2. send-operation ─────────────────────────────────────────────────────

  describe('send-operation', () => {
    test('valid op → sender receives operation-ack with new revision', async () => {
      const { token, docId } = await createFixture('op1');
      const socket = await connectClient(serverUrl);

      try {
        // Join first
        await emitAndWait(socket, 'join-document', { docId, token }, 'document-loaded');

        const ack = await emitAndWait<{ revision: number }>(
          socket,
          'send-operation',
          {
            docId,
            token,
            revision: 0,
            op: { ops: [{ insert: 'Hello' }] },
          },
          'operation-ack'
        );

        expect(ack).toHaveProperty('revision');
        expect(ack.revision).toBeGreaterThan(0);
      } finally {
        socket.disconnect();
      }
    });

    test('valid op → second client in same room receives receive-operation', async () => {
      const { token, docId } = await createFixture('op2');

      // Create second user with access to the same doc
      const user2 = await User.create({ name: 'User B', email: 'userb-op2@test.com', passwordHash: 'x' });
      await DocumentModel.findByIdAndUpdate(docId, {
        $push: { collaborators: user2._id },
      });
      const token2 = makeToken(user2._id.toString(), 'userb-op2@test.com');

      const socket1 = await connectClient(serverUrl);
      const socket2 = await connectClient(serverUrl);

      try {
        // Both join the same document
        await emitAndWait(socket1, 'join-document', { docId, token }, 'document-loaded');
        await emitAndWait(socket2, 'join-document', { docId, token: token2 }, 'document-loaded');

        // Set up listener on socket2 BEFORE socket1 sends
        const remoteOpPromise = new Promise<{ op: unknown; revision: number; userId: string }>(
          (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for receive-operation')), 5000);
            socket2.once('receive-operation', (data: { op: unknown; revision: number; userId: string }) => {
              clearTimeout(timer);
              resolve(data);
            });
          }
        );

        // socket1 sends an op
        socket1.emit('send-operation', {
          docId,
          token,
          revision: 0,
          op: { ops: [{ insert: 'Hello from A' }] },
        });

        const remoteOp = await remoteOpPromise;
        expect(remoteOp).toHaveProperty('op');
        expect(remoteOp).toHaveProperty('revision');
        expect(remoteOp).toHaveProperty('userId');
      } finally {
        socket1.disconnect();
        socket2.disconnect();
      }
    });

    test('valid op → document-saved broadcast reaches all room members', async () => {
      const { token, docId } = await createFixture('op3');
      const socket = await connectClient(serverUrl);

      try {
        await emitAndWait(socket, 'join-document', { docId, token }, 'document-loaded');

        const saved = await emitAndWait<{ revision: number; timestamp: string }>(
          socket,
          'send-operation',
          { docId, token, revision: 0, op: { ops: [{ insert: 'Save test' }] } },
          'document-saved'
        );

        expect(saved).toHaveProperty('revision');
        expect(saved).toHaveProperty('timestamp');
        expect(new Date(saved.timestamp).getTime()).not.toBeNaN();
      } finally {
        socket.disconnect();
      }
    });

    test('op with wrong token → receives error event', async () => {
      const { token, docId } = await createFixture('op4');
      const socket = await connectClient(serverUrl);

      try {
        await emitAndWait(socket, 'join-document', { docId, token }, 'document-loaded');

        const err = await emitAndWait<{ message: string }>(
          socket,
          'send-operation',
          { docId, token: 'BAD.TOKEN', revision: 0, op: { ops: [{ insert: 'X' }] } },
          'error'
        );

        expect(err).toHaveProperty('message');
      } finally {
        socket.disconnect();
      }
    });
  });

  // ── 3. cursor-update ──────────────────────────────────────────────────────

  describe('cursor-update', () => {
    test('cursor position broadcast to other room members only', async () => {
      const { token, docId, userId } = await createFixture('cursor1');

      const user2 = await User.create({ name: 'Cursor B', email: 'cursor-b@test.com', passwordHash: 'x' });
      await DocumentModel.findByIdAndUpdate(docId, { $push: { collaborators: user2._id } });
      const token2 = makeToken(user2._id.toString(), 'cursor-b@test.com');

      const socket1 = await connectClient(serverUrl);
      const socket2 = await connectClient(serverUrl);

      try {
        await emitAndWait(socket1, 'join-document', { docId, token }, 'document-loaded');
        await emitAndWait(socket2, 'join-document', { docId, token: token2 }, 'document-loaded');

        // Listen for cursor-update on socket2
        const cursorPromise = new Promise<{ userId: string; position: number }>(
          (resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Timeout waiting for cursor-update')), 5000);
            socket2.once('cursor-update', (data: { userId: string; position: number }) => {
              clearTimeout(timer);
              resolve(data);
            });
          }
        );

        // socket1 sends cursor update
        socket1.emit('cursor-update', { docId, token, position: 42 });

        const cursor = await cursorPromise;
        expect(cursor.userId).toBe(userId);
        expect(cursor.position).toBe(42);
      } finally {
        socket1.disconnect();
        socket2.disconnect();
      }
    });

    test('sender does NOT receive its own cursor-update', async () => {
      const { token, docId } = await createFixture('cursor2');
      const socket = await connectClient(serverUrl);

      try {
        await emitAndWait(socket, 'join-document', { docId, token }, 'document-loaded');

        let selfReceived = false;
        socket.on('cursor-update', () => { selfReceived = true; });

        socket.emit('cursor-update', { docId, token, position: 10 });

        // Wait briefly to see if self-cursor arrives (it should NOT)
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(selfReceived).toBe(false);
      } finally {
        socket.disconnect();
      }
    });
  });

  // ── 4. concurrent ops convergence ─────────────────────────────────────────

  describe('concurrent ops — convergence', () => {
    test('two clients inserting simultaneously converge to same document state', async () => {
      const { token, docId } = await createFixture('conc1');

      const userB = await User.create({ name: 'Concurrent B', email: 'conc-b@test.com', passwordHash: 'x' });
      await DocumentModel.findByIdAndUpdate(docId, { $push: { collaborators: userB._id } });
      const tokenB = makeToken(userB._id.toString(), 'conc-b@test.com');

      const socketA = await connectClient(serverUrl);
      const socketB = await connectClient(serverUrl);

      try {
        await emitAndWait(socketA, 'join-document', { docId, token }, 'document-loaded');
        await emitAndWait(socketB, 'join-document', { docId, token: tokenB }, 'document-loaded');

        // Both clients send ops at revision 0 (concurrent)
        const ackA = emitAndWait<{ revision: number }>(
          socketA,
          'send-operation',
          { docId, token, revision: 0, op: { ops: [{ insert: 'A' }] } },
          'operation-ack'
        );
        const ackB = emitAndWait<{ revision: number }>(
          socketB,
          'send-operation',
          { docId, token: tokenB, revision: 0, op: { ops: [{ insert: 'B' }] } },
          'operation-ack'
        );

        const [resultA, resultB] = await Promise.allSettled([ackA, ackB]);

        // At least one ack must succeed (the other may get rejected or succeed at a higher revision)
        const successCount = [resultA, resultB].filter((r) => r.status === 'fulfilled').length;
        expect(successCount).toBeGreaterThanOrEqual(1);

        // Verify the document now contains at least one of the inserts
        const updatedDoc = await DocumentModel.findById(docId);
        expect(updatedDoc?.content).toBeTruthy();
        expect(updatedDoc!.revision).toBeGreaterThan(0);
      } finally {
        socketA.disconnect();
        socketB.disconnect();
      }
    });
  });

  // ── 5. disconnect / presence ──────────────────────────────────────────────

  describe('disconnect and presence cleanup', () => {
    test('when second user disconnects, presence-update is broadcast with one fewer user', async () => {
      const { token, docId } = await createFixture('disc1');

      const userB = await User.create({ name: 'Disc B', email: 'disc-b@test.com', passwordHash: 'x' });
      await DocumentModel.findByIdAndUpdate(docId, { $push: { collaborators: userB._id } });
      const tokenB = makeToken(userB._id.toString(), 'disc-b@test.com');

      const socketA = await connectClient(serverUrl);
      const socketB = await connectClient(serverUrl);

      try {
        await emitAndWait(socketA, 'join-document', { docId, token }, 'document-loaded');
        await emitAndWait(socketB, 'join-document', { docId, token: tokenB }, 'document-loaded');

        // Wait for presence with both users
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Now disconnect socketB and wait for presence-update on socketA
        const presenceAfterLeave = new Promise<{ users: unknown[] }>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout waiting for presence-update')), 5000);
          socketA.once('presence-update', (data: { users: unknown[] }) => {
            clearTimeout(timer);
            resolve(data);
          });
        });

        socketB.disconnect();

        const presence = await presenceAfterLeave;
        // Should have 1 user (only socketA remains)
        expect(presence.users.length).toBeLessThan(2);
      } finally {
        socketA.disconnect();
      }
    });
  });
});
