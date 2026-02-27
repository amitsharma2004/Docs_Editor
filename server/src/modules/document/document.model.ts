import mongoose, { Document, Schema, Types } from 'mongoose';

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface ICollaborator {
  userId: Types.ObjectId;
  role: CollaboratorRole;
  addedAt: Date;
}

export interface IDocument extends Document {
  title: string;
  slug: string; // URL-friendly slug for sharing
  content: string; // Quill Delta JSON stringified
  ownerId: Types.ObjectId;
  collaborators: ICollaborator[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const CollaboratorSchema = new Schema<ICollaborator>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DocumentSchema = new Schema<IDocument>(
  {
    title: { type: String, required: true, default: 'Untitled Document', trim: true },
    slug: { type: String, sparse: true }, // sparse index allows null/undefined
    content: { type: String, default: '' }, // Quill Delta JSON
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [CollaboratorSchema],
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DocumentSchema.index({ ownerId: 1 });
DocumentSchema.index({ 'collaborators.userId': 1 });
DocumentSchema.index({ slug: 1 }, { sparse: true, unique: true });

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);

