import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../user/user.model';
import { findUserByEmail } from '../user/user.service';
import { getRedisClient } from '../../config/redis';
import logger from '../../utils/logger';

const SALT_ROUNDS = 12;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

/**
 * Register a new user. Returns JWT tokens on success.
 */
export const registerUser = async (name: string, email: string, password: string): Promise<AuthTokens> => {
  const existing = await findUserByEmail(email);
  if (existing) throw new Error('Email already in use');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });
  logger.info('info', `User registered: ${user._id}`);
  return generateTokens(user._id.toString(), user.email);
};

/**
 * Login an existing user. Returns JWT tokens on success.
 */
export const loginUser = async (email: string, password: string): Promise<AuthTokens> => {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  logger.info('info', `User logged in: ${user._id}`);
  return generateTokens(user._id.toString(), user.email);
};

/**
 * Generate access + refresh JWT token pair.
 */
export const generateTokens = (userId: string, email: string): AuthTokens => {
  const payload: JWTPayload = { userId, email };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET as string, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

/**
 * Verify an access token. Returns decoded payload.
 */
export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, process.env.JWT_SECRET as string) as JWTPayload;
};

/**
 * Blacklist a token in Redis on logout.
 */
export const blacklistToken = async (token: string): Promise<void> => {
  const redis = getRedisClient();
  await redis.set(`blacklist:${token}`, '1', 'EX', 60 * 60 * 24 * 7); // 7 days TTL
};

/**
 * Check if a token is blacklisted.
 */
export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const redis = getRedisClient();
  const result = await redis.get(`blacklist:${token}`);
  return result === '1';
};
