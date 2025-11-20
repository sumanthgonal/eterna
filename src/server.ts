import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { initDatabase, closeDatabase } from './config/database';
import { closeRedis } from './config/redis';
import { OrderQueue } from './services/orderQueue';
import { WebSocketManager } from './services/websocketManager';
import { orderRoutes } from './routes/orders';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000');

async function startServer() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  try {
    await initDatabase();

    await fastify.register(fastifyWebsocket);

    const orderQueue = new OrderQueue();
    const wsManager = new WebSocketManager();

    orderQueue.on('statusUpdate', (update) => {
      wsManager.sendUpdate(update);
    });

    await fastify.register(async (instance) => {
      await orderRoutes(instance, orderQueue, wsManager);
    });

    fastify.addHook('onClose', async () => {
      console.log('Shutting down gracefully...');
      await orderQueue.close();
      await closeDatabase();
      await closeRedis();
    });

    await fastify.listen({ port: PORT, host: '0.0.0.0' });

    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/api/orders/:orderId/ws`);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  process.exit(0);
});

startServer();
