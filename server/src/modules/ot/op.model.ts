import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Represents a single Operational Transformation operation stored in history.
 * docId    → the document this op belongs to
 * userId   → the user who submitted the op
 * op       → the Quill Delta operation payload (JSON stringified)
 * revision → the server revision AFTER this op was applied
 */
export interface IOp extends Document {
  docId: Types.ObjectId;
  userId: Types.ObjectId;
  op: string; // JSON stringified Quill Delta
  revision: number;
  timestamp: Date;
}

const OpSchema = new Schema<IOp>({
  docId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  op: { type: String, required: true },
  revision: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

OpSchema.index({ docId: 1, revision: 1 });

export const Op = mongoose.model<IOp>('Op', OpSchema);
