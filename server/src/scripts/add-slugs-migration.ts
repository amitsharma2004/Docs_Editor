import 'dotenv/config';
import mongoose from 'mongoose';
import { DocumentModel } from '../modules/document/document.model';
import logger from '../utils/logger';

/**
 * Generate a URL-friendly slug from title and short ID
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
 * Migration script to add slugs to existing documents
 */
async function addSlugsToDocuments() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/gdocs';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    // Find all documents without slugs or with temp-slug
    const documents = await DocumentModel.find({
      $or: [
        { slug: { $exists: false } },
        { slug: '' },
        { slug: 'temp-slug' }
      ]
    });

    logger.info(`Found ${documents.length} documents without slugs`);

    for (const doc of documents) {
      const slug = generateSlug(doc.title, doc._id.toString());
      doc.slug = slug;
      
      // Ensure owner is in collaborators with owner role
      const ownerInCollaborators = doc.collaborators.some(
        c => c.userId.toString() === doc.ownerId.toString()
      );
      
      if (!ownerInCollaborators) {
        doc.collaborators.push({
          userId: doc.ownerId,
          role: 'owner',
          addedAt: new Date()
        });
      }
      
      await doc.save();
      logger.info(`Updated document ${doc._id} with slug: ${slug}`);
    }

    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Migration failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

addSlugsToDocuments();
