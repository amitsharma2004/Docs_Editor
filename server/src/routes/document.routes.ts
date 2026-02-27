import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../modules/auth/auth.middleware';
import {
  createDocument,
  getUserDocuments,
  getDocumentById,
  updateDocumentTitle,
  deleteDocument,
} from '../modules/document/document.service';

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
