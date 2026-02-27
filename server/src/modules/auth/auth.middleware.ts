import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenBlacklisted } from './auth.service';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

/**
 * JWT authentication middleware.
 * Validates Bearer token, checks blacklist, attaches user to req.
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      res.status(401).json({ message: 'Token revoked' });
      return;
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
