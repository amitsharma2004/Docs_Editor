import { User, IUser } from './user.model';

/**
 * Find a user by their email address.
 */
export const findUserByEmail = async (email: string): Promise<IUser | null> => {
  return User.findOne({ email });
};

/**
 * Find a user by their MongoDB ObjectId.
 */
export const findUserById = async (id: string): Promise<IUser | null> => {
  return User.findById(id).select('-passwordHash');
};
