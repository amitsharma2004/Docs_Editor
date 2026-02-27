import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../modules/auth/auth.middleware';
import { findUserById } from '../modules/user/user.service';

const router = Router();

/** GET /api/users/me — get current user profile */
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
