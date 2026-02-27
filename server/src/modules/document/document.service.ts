import { DocumentModel, IDocument } from './document.model';
import { Types } from 'mongoose';
import { writeLog } from '../../utils/logger';

/**
 * Create a new document owned by the given user.
 */
export const createDocument = async (ownerId: string, title?: string): Promise<IDocument> => {
  const doc = await DocumentModel.create({ ownerId: new Types.ObjectId(ownerId), title: title || 'Untitled Document' });
  writeLog('info', `Document created: ${doc._id} by user ${ownerId}`);
  return doc;
};

/**
 * Get all documents accessible to the user (owned or collaborator).
 */
export const getUserDocuments = async (userId: string): Promise<IDocument[]> => {
  const uid = new Types.ObjectId(userId);
  return DocumentModel.find({ $or: [{ ownerId: uid }, { collaborators: uid }] }).sort({ updatedAt: -1 });
};

/**
 * Get a single document by ID. Throws if not found.
 */
export const getDocumentById = async (docId: string, userId: string): Promise<IDocument> => {
  const uid = new Types.ObjectId(userId);
  const doc = await DocumentModel.findOne({
    _id: docId,
    $or: [{ ownerId: uid }, { collaborators: uid }],
  });
  if (!doc) throw new Error('Document not found or access denied');
  return doc;
};

/**
 * Update document title. Only owner can rename.
 */
export const updateDocumentTitle = async (docId: string, userId: string, title: string): Promise<IDocument> => {
  const doc = await DocumentModel.findOneAndUpdate(
    { _id: docId, ownerId: new Types.ObjectId(userId) },
    { title },
    { new: true }
  );
  if (!doc) throw new Error('Document not found or unauthorized');
  return doc;
};

/**
 * Delete a document. Only owner can delete.
 */
export const deleteDocument = async (docId: string, userId: string): Promise<void> => {
  const result = await DocumentModel.deleteOne({ _id: docId, ownerId: new Types.ObjectId(userId) });
  if (result.deletedCount === 0) throw new Error('Document not found or unauthorized');
  writeLog('info', `Document deleted: ${docId} by user ${userId}`);
};

/**
 * Atomically update document content and increment revision.
 * Used by the OT engine after applying a transformed operation.
 */
export const applyOperationToDocument = async (
  docId: string,
  content: string,
  expectedRevision: number
): Promise<IDocument | null> => {
  return DocumentModel.findOneAndUpdate(
    { _id: docId, revision: expectedRevision },
    { $set: { content }, $inc: { revision: 1 } },
    { new: true }
  );
};
