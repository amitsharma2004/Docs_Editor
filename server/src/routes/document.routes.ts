import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../modules/auth/auth.middleware';
import {
  createDocument,
  getUserDocuments,
  getDocumentById,
  getDocumentBySlug,
  updateDocumentTitle,
  deleteDocument,
  addCollaborator,
  updateCollaboratorRole,
  removeCollaborator,
} from '../modules/document/document.service';
import { CollaboratorRole } from '../modules/document/document.model';

const router = Router();

// All document routes require authentication
router.use(authenticate);

/** GET /api/documents — list user's documents */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docs = await getUserDocuments(req.user!.userId);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/** POST /api/documents — create a new document */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title } = req.body;
    const doc = await createDocument(req.user!.userId, title);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/** GET /api/documents/slug/:slug — get document by slug (for sharing) */
router.get('/slug/:slug', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await getDocumentBySlug(req.params.slug);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    
    // Check if user has access
    const userId = req.user!.userId;
    const hasAccess = doc.ownerId.toString() === userId || 
                      doc.collaborators.some(c => c.userId.toString() === userId);
    
    if (!hasAccess) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }
    
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/** GET /api/documents/:id — get document by ID */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await getDocumentById(req.params.id, req.user!.userId);
    res.json(doc);
  } catch (err) {
    res.status(404).json({ message: (err as Error).message });
  }
});

/** PATCH /api/documents/:id — update title */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title } = req.body;
    const doc = await updateDocumentTitle(req.params.id, req.user!.userId, title);
    res.json(doc);
  } catch (err) {
    res.status(403).json({ message: (err as Error).message });
  }
});

/** POST /api/documents/:id/share — add a collaborator */
router.post('/:id/share', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, role } = req.body;
    
    if (!email || !role) {
      res.status(400).json({ message: 'Email and role are required' });
      return;
    }
    
    if (!['editor', 'viewer'].includes(role)) {
      res.status(400).json({ message: 'Role must be either "editor" or "viewer"' });
      return;
    }
    
    const doc = await addCollaborator(
      req.params.id, 
      req.user!.userId, 
      email, 
      role as CollaboratorRole
    );
    
    res.json(doc);
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

/** PATCH /api/documents/:id/collaborators/:collaboratorId — update collaborator role */
router.patch('/:id/collaborators/:collaboratorId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role } = req.body;
    
    if (!role || !['editor', 'viewer'].includes(role)) {
      res.status(400).json({ message: 'Valid role is required' });
      return;
    }
    
    const doc = await updateCollaboratorRole(
      req.params.id,
      req.user!.userId,
      req.params.collaboratorId,
      role as CollaboratorRole
    );
    
    res.json(doc);
  } catch (err) {
    res.status(403).json({ message: (err as Error).message });
  }
});

/** DELETE /api/documents/:id/collaborators/:collaboratorId — remove collaborator */
router.delete('/:id/collaborators/:collaboratorId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await removeCollaborator(
      req.params.id,
      req.user!.userId,
      req.params.collaboratorId
    );
    
    res.json(doc);
  } catch (err) {
    res.status(403).json({ message: (err as Error).message });
  }
});

/** DELETE /api/documents/:id — delete document */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await deleteDocument(req.params.id, req.user!.userId);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(403).json({ message: (err as Error).message });
  }
});

export default router;
