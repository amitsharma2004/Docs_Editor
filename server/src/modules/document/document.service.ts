import { DocumentModel, IDocument, CollaboratorRole } from './document.model';
import { Types } from 'mongoose';
import logger from '../../utils/logger';

/**
 * Generate a URL-friendly slug from title and short ID
 * Format: title-slug-shortid
 */
const generateSlug = (title: string, docId: string): string => {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  const shortId = docId.substring(docId.length - 8);
  return `${titleSlug}-${shortId}`;
};

/**
 * Check if user has a specific role or higher permission
 */
const hasPermission = (doc: IDocument, userId: string, requiredRole: CollaboratorRole): boolean => {
  const uid = userId.toString();
  
  // Owner has all permissions
  if (doc.ownerId.toString() === uid) return true;
  
  const collaborator = doc.collaborators.find(c => c.userId.toString() === uid);
  if (!collaborator) return false;
  
  // Permission hierarchy: owner > editor > viewer
  if (requiredRole === 'viewer') return true;
  if (requiredRole === 'editor') return collaborator.role === 'editor' || collaborator.role === 'owner';
  if (requiredRole === 'owner') return collaborator.role === 'owner';
  
  return false;
};

/**
 * Create a new document owned by the given user.
 */
export const createDocument = async (ownerId: string, title?: string): Promise<IDocument> => {
  const docTitle = title || 'Untitled Document';
  const tempDoc = await DocumentModel.create({ 
    ownerId: new Types.ObjectId(ownerId), 
    title: docTitle,
    slug: 'temp-slug', // Temporary slug
    collaborators: [{
      userId: new Types.ObjectId(ownerId),
      role: 'owner' as CollaboratorRole,
      addedAt: new Date()
    }]
  });
  
  // Update with proper slug using the generated ID
  const slug = generateSlug(docTitle, tempDoc._id.toString());
  tempDoc.slug = slug;
  await tempDoc.save();
  
  logger.info(`Document created: ${tempDoc._id} by user ${ownerId}`);
  return tempDoc;
};

/**
 * Get all documents accessible to the user (owned or collaborator).
 */
export const getUserDocuments = async (userId: string): Promise<IDocument[]> => {
  const uid = new Types.ObjectId(userId);
  return DocumentModel.find({ 
    $or: [
      { ownerId: uid }, 
      { 'collaborators.userId': uid }
    ] 
  }).sort({ updatedAt: -1 });
};

/**
 * Get a single document by ID or slug. Throws if not found.
 */
export const getDocumentById = async (docIdOrSlug: string, userId: string): Promise<IDocument> => {
  const uid = new Types.ObjectId(userId);
  
  // Try to find by ID first, then by slug
  const query = Types.ObjectId.isValid(docIdOrSlug) 
    ? { _id: docIdOrSlug }
    : { slug: docIdOrSlug };
  
  const doc = await DocumentModel.findOne({
    ...query,
    $or: [
      { ownerId: uid }, 
      { 'collaborators.userId': uid }
    ],
  });
  
  if (!doc) throw new Error('Document not found or access denied');
  return doc;
};

/**
 * Get document by slug (public access for sharing)
 */
export const getDocumentBySlug = async (slug: string): Promise<IDocument | null> => {
  return DocumentModel.findOne({ slug });
};

/**
 * Update document title. Only owner or editor can rename.
 */
export const updateDocumentTitle = async (docId: string, userId: string, title: string): Promise<IDocument> => {
  const doc = await DocumentModel.findById(docId);
  if (!doc) throw new Error('Document not found');
  
  if (!hasPermission(doc, userId, 'editor')) {
    throw new Error('Unauthorized: Only owner or editor can update title');
  }
  
  doc.title = title;
  doc.slug = generateSlug(title, doc._id.toString());
  await doc.save();
  
  return doc;
};

/**
 * Add a collaborator to a document with a specific role
 */
export const addCollaborator = async (
  docId: string, 
  ownerId: string, 
  collaboratorEmail: string, 
  role: CollaboratorRole
): Promise<IDocument> => {
  const doc = await DocumentModel.findOne({ _id: docId, ownerId: new Types.ObjectId(ownerId) });
  if (!doc) throw new Error('Document not found or unauthorized');
  
  // Find user by email (you'll need to import UserModel)
  const { getUserByEmail } = await import('../user/user.service');
  const collaboratorUser = await getUserByEmail(collaboratorEmail);
  if (!collaboratorUser) throw new Error('User not found');
  
  // Check if already a collaborator
  const exists = doc.collaborators.some(c => c.userId.toString() === collaboratorUser._id.toString());
  if (exists) throw new Error('User is already a collaborator');
  
  doc.collaborators.push({
    userId: collaboratorUser._id,
    role,
    addedAt: new Date()
  });
  
  await doc.save();
  logger.info(`Collaborator ${collaboratorEmail} added to document ${docId} with role ${role}`);
  return doc;
};

/**
 * Update collaborator role
 */
export const updateCollaboratorRole = async (
  docId: string,
  ownerId: string,
  collaboratorId: string,
  newRole: CollaboratorRole
): Promise<IDocument> => {
  const doc = await DocumentModel.findOne({ _id: docId, ownerId: new Types.ObjectId(ownerId) });
  if (!doc) throw new Error('Document not found or unauthorized');
  
  const collaborator = doc.collaborators.find(c => c.userId.toString() === collaboratorId);
  if (!collaborator) throw new Error('Collaborator not found');
  
  collaborator.role = newRole;
  await doc.save();
  
  return doc;
};

/**
 * Remove a collaborator from a document
 */
export const removeCollaborator = async (
  docId: string,
  ownerId: string,
  collaboratorId: string
): Promise<IDocument> => {
  const doc = await DocumentModel.findOne({ _id: docId, ownerId: new Types.ObjectId(ownerId) });
  if (!doc) throw new Error('Document not found or unauthorized');
  
  doc.collaborators = doc.collaborators.filter(c => c.userId.toString() !== collaboratorId);
  await doc.save();
  
  logger.info(`Collaborator ${collaboratorId} removed from document ${docId}`);
  return doc;
};

/**
 * Delete a document. Only owner can delete.
 */
export const deleteDocument = async (docId: string, userId: string): Promise<void> => {
  const result = await DocumentModel.deleteOne({ _id: docId, ownerId: new Types.ObjectId(userId) });
  if (result.deletedCount === 0) throw new Error('Document not found or unauthorized');
  logger.info(`Document deleted: ${docId} by user ${userId}`);
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
