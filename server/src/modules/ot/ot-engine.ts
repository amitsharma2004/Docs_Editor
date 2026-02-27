/**
 * OT Engine — Server-side Operational Transformation
 *
 * Implementation based on the Jupiter OT algorithm (Nichols et al., 1995)
 * using Quill Delta as the operation format.
 *
 * Core invariant:
 *   Given two concurrent operations A and B that diverge from the same
 *   document state, transform(A, B) produces A' such that:
 *
 *     apply(apply(doc, B), A') == apply(apply(doc, A), B')
 *
 *   i.e., both orderings converge to the same final document state.
 *
 * How it works:
 *   1. Client sends op with its local revision N.
 *   2. Server may be at revision M (M >= N) — meaning M-N ops were applied
 *      concurrently since the client last synced.
 *   3. We iteratively transform the client op against each of those M-N
 *      server ops (in revision order), using Delta.transform().
 *   4. The resulting op is safe to apply on top of the server's current state.
 *
 * References:
 *   - Jupiter OT: https://dl.acm.org/doi/10.1145/215585.215706
 *   - Quill Delta spec: https://quilljs.com/docs/delta/
 *   - quill-delta npm: https://www.npmjs.com/package/quill-delta
 */

import Delta from 'quill-delta';

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * A Quill Delta operation payload.
 * Each op in the `ops` array is one of: insert, delete, or retain.
 */
export interface QuillDelta {
  ops: Array<{
    insert?: string | Record<string, unknown>;
    delete?: number;
    retain?: number;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * A collaboration operation as submitted by a client or stored on the server.
 */
export interface Operation {
  op: QuillDelta;
  revision: number;
  userId: string;
  docId: string;
}

/**
 * Result returned by transformOperation().
 */
export interface TransformResult {
  transformedOp: QuillDelta;
  newRevision: number;
}

// ─── Core OT functions ────────────────────────────────────────────────────────

/**
 * Transform a client operation against all server operations applied
 * since the client's revision, producing an op that can be safely
 * applied on top of the current server state.
 *
 * Algorithm (iterative Jupiter transform):
 *   Let clientDelta = clientOp.op
 *   For each serverOp in pendingOps (sorted by revision ASC):
 *     clientDelta = serverDelta.transform(clientDelta, priority=true)
 *     // priority=true → server op takes precedence in insert-insert conflicts
 *   Return clientDelta as the transformed op.
 *
 * Conflict resolution:
 *   - Insert vs Insert at same position → server insert goes first (priority=true)
 *   - Insert vs Delete → insert position adjusted past the deleted range
 *   - Delete vs Delete (overlapping range) → union of deletions, no double-delete
 *   - Retain adjustments → carried through automatically by Delta.transform()
 *
 * @param clientOp   - The op submitted by the client at its local revision
 * @param pendingOps - All server ops with revision > clientOp.revision
 * @returns          - Transformed op ready to apply + the target server revision
 */
export const transformOperation = (
  clientOp: Operation,
  pendingOps: Operation[]
): TransformResult => {
  // No concurrent ops — op applies cleanly as-is
  if (pendingOps.length === 0) {
    return {
      transformedOp: clientOp.op,
      newRevision: clientOp.revision,
    };
  }

  // Sort pending server ops by revision ascending to replay in correct order
  const sortedPending = [...pendingOps].sort((a, b) => a.revision - b.revision);

  // Start with the raw client delta
  let transformedDelta = new Delta(clientOp.op.ops as ConstructorParameters<typeof Delta>[0]);

  for (const pendingOp of sortedPending) {
    const serverDelta = new Delta(pendingOp.op.ops as ConstructorParameters<typeof Delta>[0]);

    /**
     * Delta.transform(other, priority):
     *   - Transforms `other` against `this`.
     *   - priority=true → `this` (server delta) wins insert-insert conflicts.
     *   - This ensures the server's already-committed history is authoritative.
     */
    transformedDelta = serverDelta.transform(transformedDelta, true);
  }

  // The new target revision is the highest revision among pending ops
  const newRevision = sortedPending[sortedPending.length - 1].revision;

  return {
    transformedOp: transformedDelta as unknown as QuillDelta,
    newRevision,
  };
};

/**
 * Apply a (transformed) operation to the current document content by
 * composing two Quill Deltas.
 *
 * Delta composition (A.compose(B)):
 *   Produces a single Delta equivalent to applying A then B.
 *   This is the standard way to advance a document state in Quill OT.
 *
 * Example:
 *   current = { ops: [{ insert: "Hello" }] }
 *   op      = { ops: [{ retain: 5 }, { insert: " World" }] }
 *   result  = { ops: [{ insert: "Hello World" }] }
 *
 * @param currentContent - Current document as a JSON-stringified QuillDelta.
 *                         Empty string or invalid JSON treated as empty doc.
 * @param op             - The transformed op to apply.
 * @returns              - New document content as JSON-stringified QuillDelta.
 */
export const applyOperation = (currentContent: string, op: QuillDelta): string => {
  try {
    // Parse current document state; default to empty Delta if blank or invalid
    let currentOps: QuillDelta['ops'] = [];
    if (currentContent) {
      const parsed: QuillDelta = JSON.parse(currentContent);
      currentOps = Array.isArray(parsed.ops) ? parsed.ops : [];
    }

    const currentDelta = new Delta(currentOps as ConstructorParameters<typeof Delta>[0]);
    const opDelta = new Delta(op.ops as ConstructorParameters<typeof Delta>[0]);

    // Compose: currentDelta ∘ opDelta → new document state
    const composed = currentDelta.compose(opDelta);

    // Convert to plain object before stringifying
    const result = { ops: composed.ops };
    return JSON.stringify(result);
  } catch (err) {
    // On any parse/compose error, treat op as the full new document state
    const result = { ops: op.ops };
    return JSON.stringify(result);
  }
};

/**
 * Utility: compute the inverse (undo) of an operation given the document
 * state BEFORE it was applied. Useful for undo/redo history.
 *
 * Delta.invert(base) returns a Delta that, when composed with `op`,
 * restores the original `base` document.
 *
 * @param op      - The operation to invert
 * @param base    - Document state before `op` was applied (JSON string)
 * @returns       - Inverse operation as QuillDelta
 */
export const invertOperation = (op: QuillDelta, base: string): QuillDelta => {
  try {
    const baseParsed: QuillDelta = base ? JSON.parse(base) : { ops: [] };
    const baseDelta = new Delta(baseParsed.ops as ConstructorParameters<typeof Delta>[0]);
    const opDelta = new Delta(op.ops as ConstructorParameters<typeof Delta>[0]);
    return opDelta.invert(baseDelta) as unknown as QuillDelta;
  } catch {
    return { ops: [] };
  }
};
