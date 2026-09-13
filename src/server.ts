import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import logger from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis } from './lib/redis';
import { errorHandler } from './middleware/errorHandler';
import { globalRateLimit } from './middleware/rateLimit.middleware';
import routes from './routes';

const app: Application = express();

app.use(helmet());
import { createDeliveryWorker } from './workers/delivery.worker';

const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  /\.vercel\.app$/,
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit
app.use(globalRateLimit);

app.use((req: Request, _res: Response, next) => {
  logger.info(`→ ${req.method} ${req.path}`);
  next();
});

app.use('/api/v1', routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    await connectRedis();

    // Start background delivery worker in-process unless explicitly disabled
    let worker: ReturnType<typeof createDeliveryWorker> | null = null;
    if (process.env.START_WORKER !== 'false') {
      worker = createDeliveryWorker();
      logger.info(' Embedded BullMQ delivery worker started');
    }

    const server = app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port}`);
      logger.info(`Environment: ${config.server.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.server.port}/api/v1/health`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down`);
      if (worker) {
        await worker.close();
      }
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

bootstrap();

export default app;