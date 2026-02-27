import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDocument extends Document {
  title: string;
  content: string; // Quill Delta JSON stringified
  ownerId: Types.ObjectId;
  collaborators: Types.ObjectId[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    title: { type: String, required: true, default: 'Untitled Document', trim: true },
    content: { type: String, default: '' }, // Quill Delta JSON
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DocumentSchema.index({ ownerId: 1 });
DocumentSchema.index({ collaborators: 1 });

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
