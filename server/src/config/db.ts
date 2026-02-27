import mongoose from 'mongoose';
import { writeLog } from '../utils/logger';

/**
 * Connect to MongoDB with retry logic.
 * Retries up to 5 times with 5-second intervals on failure.
 */
export const connectDB = async (retries = 5): Promise<void> => {
  try {
    const uri = process.env.MONGO_URI as string;
    await mongoose.connect(uri);
    writeLog('info', 'MongoDB connected successfully');
  } catch (error) {
    writeLog('error', `MongoDB connection failed: ${(error as Error).message}`);
    if (retries > 0) {
      writeLog('info', `Retrying MongoDB connection... (${retries} attempts left)`);
      await new Promise((res) => setTimeout(res, 5000));
      return connectDB(retries - 1);
    }
    process.exit(1);
  }
};
