import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectDB } from './config/db';
import { getRedisClient } from './config/redis';
import { registerOTGateway } from './modules/ot/ot-gateway';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import userRoutes from './routes/user.routes';
import logger from './utils/logger';

const app = express();
const httpServer = createServer(app);

// Initialize database connections
const initializeConnections = async () => {
  try {
    await connectDB();
    await getRedisClient().connect();
    logger.info('All database connections established');
  } catch (error) {
    logger.error(`Failed to initialize connections: ${(error as Error).message}`);
    process.exit(1);
  }
};

initializeConnections();


// ── Socket.io Setup ────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// ── REST Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── OT Socket.io Gateway ───────────────────────────────────────────────────
registerOTGateway(io);

// ── Bootstrap ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);
httpServer.listen(PORT, () => {
  logger.info(`Server is running on port: ${PORT}`);
});


export { app, io };
