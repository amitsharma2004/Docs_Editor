import { User, IUser } from './user.model';

/**
 * Find a user by their email address.
 */
export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  return User.findOne({ email });
};

/**
 * Get user by email (alias for findUserByEmail)
 */
export const getUserByEmail = async (email: string): Promise<IUser | null> => {
  return findUserByEmail(email);
};

/**
 * Find a user by their MongoDB ObjectId.
 */
export const findUserById = async (id: string): Promise<IUser | null> => {
  return User.findById(id).select('-passwordHash');
};
