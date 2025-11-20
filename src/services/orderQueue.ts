import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { OrderExecutor } from './orderExecutor';
import { OrderStatusUpdate } from '../types';
import EventEmitter from 'events';

export class OrderQueue extends EventEmitter {
  private queue: Queue;
  private worker: Worker;
  private orderExecutor: OrderExecutor;

  constructor() {
    super();

    this.orderExecutor = new OrderExecutor();

    this.orderExecutor.on('statusUpdate', (update: OrderStatusUpdate) => {
      this.emit('statusUpdate', update);
    });

    this.queue = new Queue('order-execution', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: parseInt(process.env.MAX_RETRIES || '3'),
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnComplete: {
          age: 3600,
          count: 1000
        },
        removeOnFail: {
          age: 86400
        }
      }
    });

    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_ORDERS || '10');

    this.worker = new Worker(
      'order-execution',
      async (job: Job) => {
        console.log(`Processing order ${job.data.orderId} (Job ${job.id})`);
        await this.orderExecutor.executeOrder(job.data.orderId);
      },
      {
        connection: redisConnection,
        concurrency: maxConcurrent,
        limiter: {
          max: parseInt(process.env.ORDERS_PER_MINUTE || '100'),
          duration: 60000
        }
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed for order ${job.data.orderId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed for order ${job?.data.orderId}:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Worker error:', err);
    });
  }

  async addOrder(orderId: string): Promise<void> {
    await this.queue.add(
      'execute',
      { orderId },
      {
        jobId: orderId
      }
    );

    console.log(`Order ${orderId} added to queue`);
  }

  async getQueueMetrics() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed
    };
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    console.log('Order queue closed');
  }
}
