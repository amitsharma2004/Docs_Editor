import { Router, Request, Response } from 'express';
import { registerUser, loginUser, blacklistToken } from '../modules/auth/auth.service';
import { authenticate, AuthRequest } from '../modules/auth/auth.middleware';

const router = Router();

/** POST /api/auth/register */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ message: 'name, email, and password are required' });
      return;
    }
    const tokens = await registerUser(name, email, password);
    res.status(201).json(tokens);
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

/** POST /api/auth/login */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: 'email and password are required' });
      return;
    }
    const tokens = await loginUser(email, password);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ message: (err as Error).message });
  }
});

/** POST /api/auth/logout — blacklist access token */
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization!.split(' ')[1];
    await blacklistToken(token);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
