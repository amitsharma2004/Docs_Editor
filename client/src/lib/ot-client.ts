/**
 * OT Client Engine
 *
 * Client-side operational transformation using the same Jupiter algorithm
 * as the server (ot-engine.ts). Uses the `quill-delta` package which is
 * bundled with Quill and available in the client build.
 *
 * Responsibilities:
 *   1. transformLocalOp  — transform a locally-pending op against an incoming
 *                          server op so the pending op can still be sent.
 *   2. composeDeltas     — compose two deltas (used to merge a remote op into
 *                          the local document state).
 *
 * Client OT state machine (simplified):
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  SYNCHRONIZED  ──(local edit)──► PENDING  ──(ack)──► SYNCED  │
 *   │                                     │                          │
 *   │                        (remote op arrives)                     │
 *   │                                     ▼                          │
 *   │                         transform(pendingOp, remoteOp)         │
 *   │                         apply remoteOp to editor               │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * See also: server/src/modules/ot/ot-engine.ts
 */

// quill-delta is a direct dependency of quill (already in node_modules)
import Delta from 'quill-delta';

export interface QuillDelta {
  ops: Array<{
    insert?: string | Record<string, unknown>;
    delete?: number;
    retain?: number;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * Transform a locally-pending (un-acknowledged) op against a remote op
 * received from the server.
 *
 * This is called when:
 *   - Client has submitted `localOp` but not yet received the server ack.
 *   - Server broadcasts a `remoteOp` from another collaborator.
 *   - We must adjust `localOp` so it still makes sense on top of `remoteOp`.
 *
 * priority=false → remote op (server) wins insert-insert conflicts.
 * This mirrors the server-side transform where server always has priority.
 *
 * @param localOp  - Pending local op (already sent to server, awaiting ack)
 * @param remoteOp - Concurrent op received from the server
 * @returns        - Transformed local op
 */
export const transformLocalOp = (localOp: QuillDelta, remoteOp: QuillDelta): QuillDelta => {
  try {
    const local = new Delta(localOp.ops as ConstructorParameters<typeof Delta>[0]);
    const remote = new Delta(remoteOp.ops as ConstructorParameters<typeof Delta>[0]);
    // remote.transform(local, false): remote wins conflicts (server is authoritative)
    return remote.transform(local, false) as unknown as QuillDelta;
  } catch {
    return localOp;
  }
};

/**
 * Compose two deltas — used when applying a remote operation to the local
 * document content string (mirrors server applyOperation).
 *
 * @param base - Current document content (JSON-stringified QuillDelta)
 * @param op   - Incoming op to apply on top of base
 * @returns    - New document content (JSON-stringified QuillDelta)
 */
export const composeDeltas = (base: string, op: QuillDelta): string => {
  try {
    const baseParsed: QuillDelta = base ? JSON.parse(base) : { ops: [] };
    const baseDelta = new Delta(baseParsed.ops as ConstructorParameters<typeof Delta>[0]);
    const opDelta = new Delta(op.ops as ConstructorParameters<typeof Delta>[0]);
    return JSON.stringify(baseDelta.compose(opDelta));
  } catch {
    return JSON.stringify(new Delta(op.ops as ConstructorParameters<typeof Delta>[0]));
  }
};
