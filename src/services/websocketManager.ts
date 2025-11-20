import { OrderStatusUpdate } from '../types';
import { WebSocket } from 'ws';

interface SocketStream {
  socket: WebSocket;
}

export class WebSocketManager {
  private connections: Map<string, SocketStream>;

  constructor() {
    this.connections = new Map();
  }

  addConnection(orderId: string, socket: SocketStream): void {
    this.connections.set(orderId, socket);

    socket.socket.on('close', () => {
      this.connections.delete(orderId);
      console.log(`WebSocket closed for order ${orderId}`);
    });

    socket.socket.on('error', (err: Error) => {
      console.error(`WebSocket error for order ${orderId}:`, err);
      this.connections.delete(orderId);
    });

    console.log(`WebSocket connected for order ${orderId}`);
  }

  sendUpdate(update: OrderStatusUpdate): void {
    const socket = this.connections.get(update.orderId);

    if (socket && socket.socket.readyState === 1) {
      socket.socket.send(JSON.stringify(update));
      console.log(`Status update sent to order ${update.orderId}:`, update.status);
    }
  }

  hasConnection(orderId: string): boolean {
    const socket = this.connections.get(orderId);
    return socket !== undefined && socket.socket.readyState === 1;
  }

  closeConnection(orderId: string): void {
    const socket = this.connections.get(orderId);
    if (socket) {
      socket.socket.close();
      this.connections.delete(orderId);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
