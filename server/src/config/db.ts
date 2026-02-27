import mongoose from 'mongoose';
import logger from '../utils/logger';

/**
 * Connect to MongoDB with retry logic.
 * Retries up to 5 times with 5-second intervals on failure.
 */
export const connectDB = async (retries = 5): Promise<void> => {
  try {
    const uri = process.env.MONGO_URI || "";
    const connection = await mongoose.connect(uri);
    logger.info(`MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection failed: ${(error as Error).message}`);
    if (retries > 0) {
      logger.info(`Retrying MongoDB connection... (${retries} attempts left)`);
      await new Promise((res) => setTimeout(res, 5000));
      return connectDB(retries - 1);
    }
    process.exit(1);
  }
};