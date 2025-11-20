import { Order, OrderStatus, OrderStatusUpdate } from '../types';
import { MockDexRouter } from './mockDexRouter';
import { OrderRepository } from '../db/orderRepository';
import { retryWithExponentialBackoff } from '../utils/helpers';
import EventEmitter from 'events';

export class OrderExecutor extends EventEmitter {
  private dexRouter: MockDexRouter;
  private orderRepository: OrderRepository;
  private maxRetries: number;

  constructor() {
    super();
    this.dexRouter = new MockDexRouter();
    this.orderRepository = new OrderRepository();
    this.maxRetries = parseInt(process.env.MAX_RETRIES || '3');
  }

  async executeOrder(orderId: string): Promise<void> {
    try {
      const order = await this.orderRepository.getOrder(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      console.log(`Starting execution for order ${orderId}`);

      await this.updateStatus(orderId, OrderStatus.ROUTING);

      const quotes = await retryWithExponentialBackoff(
        async () => {
          return await this.dexRouter.getBestQuote(
            order.tokenIn,
            order.tokenOut,
            order.amountIn
          );
        },
        this.maxRetries
      );

      this.emitStatusUpdate({
        orderId,
        status: OrderStatus.ROUTING,
        timestamp: new Date(),
        routing: {
          raydium: quotes.raydium,
          meteora: quotes.meteora,
          selected: quotes.best.dex
        }
      });

      await this.updateStatus(orderId, OrderStatus.BUILDING);

      const minOutputAmount = quotes.best.outputAmount * (1 - order.slippage);
      if (quotes.best.outputAmount < minOutputAmount) {
        throw new Error('Slippage tolerance exceeded during quote');
      }

      await this.updateStatus(orderId, OrderStatus.SUBMITTED);

      const result = await retryWithExponentialBackoff(
        async () => {
          return await this.dexRouter.executeSwap(order, quotes.best);
        },
        this.maxRetries
      );

      await this.orderRepository.updateOrderStatus(
        orderId,
        OrderStatus.CONFIRMED,
        {
          txHash: result.txHash,
          executedPrice: result.executedPrice,
          executedAmount: result.executedAmount,
          dex: result.dex
        }
      );

      this.emitStatusUpdate({
        orderId,
        status: OrderStatus.CONFIRMED,
        timestamp: new Date(),
        txHash: result.txHash,
        executedPrice: result.executedPrice,
        dex: result.dex
      });

      console.log(`Order ${orderId} completed successfully`);

    } catch (error) {
      console.error(`Order ${orderId} failed:`, error);

      const retryCount = await this.orderRepository.incrementRetryCount(orderId);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (retryCount >= this.maxRetries) {
        await this.orderRepository.updateOrderStatus(
          orderId,
          OrderStatus.FAILED,
          { error: errorMessage }
        );

        this.emitStatusUpdate({
          orderId,
          status: OrderStatus.FAILED,
          timestamp: new Date(),
          error: errorMessage
        });

        console.log(`Order ${orderId} permanently failed after ${retryCount} retries`);
      } else {
        console.log(`Order ${orderId} will be retried (attempt ${retryCount}/${this.maxRetries})`);
        throw error;
      }
    }
  }

  private async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    await this.orderRepository.updateOrderStatus(orderId, status);

    const update: OrderStatusUpdate = {
      orderId,
      status,
      timestamp: new Date()
    };

    await this.orderRepository.addStatusHistory(update);
    this.emitStatusUpdate(update);
  }

  private emitStatusUpdate(update: OrderStatusUpdate): void {
    this.emit('statusUpdate', update);
  }
}
