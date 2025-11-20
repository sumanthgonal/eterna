import { pool } from '../config/database';
import { Order, OrderStatus, OrderStatusUpdate, DexType } from '../types';

export class OrderRepository {
  async createOrder(order: Omit<Order, 'createdAt' | 'updatedAt'>): Promise<Order> {
    const query = `
      INSERT INTO orders (
        order_id, type, token_in, token_out, amount_in, slippage, status, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      order.orderId,
      order.type,
      order.tokenIn,
      order.tokenOut,
      order.amountIn,
      order.slippage,
      order.status,
      order.retryCount || 0
    ];

    const result = await pool.query(query, values);
    return this.mapRowToOrder(result.rows[0]);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const query = 'SELECT * FROM orders WHERE order_id = $1';
    const result = await pool.query(query, [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOrder(result.rows[0]);
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updates?: {
      txHash?: string;
      executedPrice?: number;
      executedAmount?: number;
      dex?: DexType;
      error?: string;
    }
  ): Promise<void> {
    const query = `
      UPDATE orders
      SET status = $1,
          tx_hash = COALESCE($2, tx_hash),
          executed_price = COALESCE($3, executed_price),
          executed_amount = COALESCE($4, executed_amount),
          dex = COALESCE($5, dex),
          error = COALESCE($6, error)
      WHERE order_id = $7
    `;

    await pool.query(query, [
      status,
      updates?.txHash,
      updates?.executedPrice,
      updates?.executedAmount,
      updates?.dex,
      updates?.error,
      orderId
    ]);
  }

  async incrementRetryCount(orderId: string): Promise<number> {
    const query = `
      UPDATE orders
      SET retry_count = retry_count + 1
      WHERE order_id = $1
      RETURNING retry_count
    `;

    const result = await pool.query(query, [orderId]);
    return result.rows[0].retry_count;
  }

  async addStatusHistory(update: OrderStatusUpdate): Promise<void> {
    const query = `
      INSERT INTO order_status_history (
        order_id, status, timestamp, tx_hash, executed_price, error, dex, routing_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await pool.query(query, [
      update.orderId,
      update.status,
      update.timestamp,
      update.txHash,
      update.executedPrice,
      update.error,
      update.dex,
      update.routing ? JSON.stringify(update.routing) : null
    ]);
  }

  async getOrderHistory(orderId: string): Promise<OrderStatusUpdate[]> {
    const query = `
      SELECT * FROM order_status_history
      WHERE order_id = $1
      ORDER BY timestamp ASC
    `;

    const result = await pool.query(query, [orderId]);
    return result.rows.map(row => ({
      orderId: row.order_id,
      status: row.status,
      timestamp: row.timestamp,
      txHash: row.tx_hash,
      executedPrice: row.executed_price ? parseFloat(row.executed_price) : undefined,
      error: row.error,
      dex: row.dex,
      routing: row.routing_data
    }));
  }

  async getRecentOrders(limit: number = 100): Promise<Order[]> {
    const query = `
      SELECT * FROM orders
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows.map(row => this.mapRowToOrder(row));
  }

  private mapRowToOrder(row: any): Order {
    return {
      orderId: row.order_id,
      type: row.type,
      tokenIn: row.token_in,
      tokenOut: row.token_out,
      amountIn: parseFloat(row.amount_in),
      slippage: parseFloat(row.slippage),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      txHash: row.tx_hash,
      executedPrice: row.executed_price ? parseFloat(row.executed_price) : undefined,
      executedAmount: row.executed_amount ? parseFloat(row.executed_amount) : undefined,
      dex: row.dex,
      error: row.error,
      retryCount: row.retry_count
    };
  }
}
