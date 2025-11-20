import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { CreateOrderRequest, OrderType, OrderStatus, CreateOrderResponse } from '../types';
import { OrderRepository } from '../db/orderRepository';
import { OrderQueue } from '../services/orderQueue';
import { WebSocketManager } from '../services/websocketManager';

export async function orderRoutes(
  fastify: FastifyInstance,
  orderQueue: OrderQueue,
  wsManager: WebSocketManager
) {
  const orderRepository = new OrderRepository();

  fastify.post<{ Body: CreateOrderRequest }>(
    '/api/orders/execute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['type', 'tokenIn', 'tokenOut', 'amountIn'],
          properties: {
            type: { type: 'string', enum: Object.values(OrderType) },
            tokenIn: { type: 'string' },
            tokenOut: { type: 'string' },
            amountIn: { type: 'number', minimum: 0 },
            slippage: { type: 'number', minimum: 0, maximum: 1 }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: CreateOrderRequest }>, reply: FastifyReply) => {
      try {
        if (request.body.type !== OrderType.MARKET) {
          return reply.code(400).send({
            error: 'Only MARKET orders are currently supported'
          });
        }

        const orderId = uuidv4();

        const order = await orderRepository.createOrder({
          orderId,
          type: request.body.type,
          tokenIn: request.body.tokenIn,
          tokenOut: request.body.tokenOut,
          amountIn: request.body.amountIn,
          slippage: request.body.slippage || 0.01,
          status: OrderStatus.PENDING,
          retryCount: 0
        });

        await orderRepository.addStatusHistory({
          orderId,
          status: OrderStatus.PENDING,
          timestamp: new Date()
        });

        await orderQueue.addOrder(orderId);

        const response: CreateOrderResponse = {
          orderId: order.orderId,
          status: order.status
        };

        return reply.code(201).send(response);
      } catch (error) {
        console.error('Error creating order:', error);
        return reply.code(500).send({
          error: 'Failed to create order',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  fastify.get('/api/orders/:orderId/ws', { websocket: true }, (connection: any, request) => {
    const { orderId } = request.params as { orderId: string };
    const socket = { socket: connection.socket };

    orderRepository.getOrder(orderId).then(order => {
      if (!order) {
        connection.socket.send(JSON.stringify({
          error: 'Order not found'
        }));
        connection.socket.close();
        return;
      }

      wsManager.addConnection(orderId, socket);

      orderRepository.getOrderHistory(orderId).then(history => {
        history.forEach(update => {
          connection.socket.send(JSON.stringify(update));
        });
      });

      connection.socket.send(JSON.stringify({
        orderId,
        status: order.status,
        timestamp: new Date(),
        message: 'Connected to order status stream'
      }));
    }).catch(error => {
      console.error('Error setting up WebSocket:', error);
      connection.socket.send(JSON.stringify({
        error: 'Failed to connect',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
      connection.socket.close();
    });
  });

  fastify.get('/api/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      const order = await orderRepository.getOrder(orderId);

      if (!order) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      return reply.send(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      return reply.code(500).send({
        error: 'Failed to fetch order',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  fastify.get('/api/orders/:orderId/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      const history = await orderRepository.getOrderHistory(orderId);

      return reply.send(history);
    } catch (error) {
      console.error('Error fetching order history:', error);
      return reply.code(500).send({
        error: 'Failed to fetch order history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  fastify.get('/api/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit } = request.query as { limit?: string };
      const orders = await orderRepository.getRecentOrders(
        limit ? parseInt(limit) : 100
      );

      return reply.send(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      return reply.code(500).send({
        error: 'Failed to fetch orders',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  fastify.get('/api/queue/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await orderQueue.getQueueMetrics();
      return reply.send({
        ...metrics,
        websocketConnections: wsManager.getConnectionCount()
      });
    } catch (error) {
      console.error('Error fetching queue metrics:', error);
      return reply.code(500).send({
        error: 'Failed to fetch queue metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
}
