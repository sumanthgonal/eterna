import { WebSocketManager } from '../services/websocketManager';
import { OrderStatus } from '../types';
import { EventEmitter } from 'events';

class MockWebSocket extends EventEmitter {
  public readyState: number = 1;
  public sentMessages: any[] = [];

  send(data: string) {
    this.sentMessages.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    wsManager = new WebSocketManager();
  });

  describe('addConnection', () => {
    it('should add a connection for an order', () => {
      const mockSocket = new MockWebSocket();
      const socketStream = { socket: mockSocket } as any;

      wsManager.addConnection('order-123', socketStream);

      expect(wsManager.hasConnection('order-123')).toBe(true);
    });

    it('should remove connection when socket closes', () => {
      const mockSocket = new MockWebSocket();
      const socketStream = { socket: mockSocket } as any;

      wsManager.addConnection('order-123', socketStream);
      expect(wsManager.hasConnection('order-123')).toBe(true);

      mockSocket.close();
      expect(wsManager.hasConnection('order-123')).toBe(false);
    });

    it('should handle multiple connections', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.addConnection('order-1', { socket: socket1 } as any);
      wsManager.addConnection('order-2', { socket: socket2 } as any);

      expect(wsManager.getConnectionCount()).toBe(2);
    });
  });

  describe('sendUpdate', () => {
    it('should send status update to connected socket', () => {
      const mockSocket = new MockWebSocket();
      const socketStream = { socket: mockSocket } as any;

      wsManager.addConnection('order-123', socketStream);

      const update = {
        orderId: 'order-123',
        status: OrderStatus.ROUTING,
        timestamp: new Date()
      };

      wsManager.sendUpdate(update);

      expect(mockSocket.sentMessages).toHaveLength(1);
      expect(mockSocket.sentMessages[0]).toMatchObject({
        orderId: 'order-123',
        status: OrderStatus.ROUTING
      });
    });

    it('should not send to disconnected socket', () => {
      const mockSocket = new MockWebSocket();
      mockSocket.readyState = 3;
      const socketStream = { socket: mockSocket } as any;

      wsManager.addConnection('order-123', socketStream);

      const update = {
        orderId: 'order-123',
        status: OrderStatus.ROUTING,
        timestamp: new Date()
      };

      wsManager.sendUpdate(update);

      expect(mockSocket.sentMessages).toHaveLength(0);
    });

    it('should handle updates for non-existent connections', () => {
      const update = {
        orderId: 'non-existent',
        status: OrderStatus.ROUTING,
        timestamp: new Date()
      };

      expect(() => wsManager.sendUpdate(update)).not.toThrow();
    });
  });

  describe('closeConnection', () => {
    it('should close and remove connection', () => {
      const mockSocket = new MockWebSocket();
      const socketStream = { socket: mockSocket } as any;

      wsManager.addConnection('order-123', socketStream);
      wsManager.closeConnection('order-123');

      expect(mockSocket.readyState).toBe(3);
      expect(wsManager.hasConnection('order-123')).toBe(false);
    });

    it('should handle closing non-existent connection', () => {
      expect(() => wsManager.closeConnection('non-existent')).not.toThrow();
    });
  });

  describe('getConnectionCount', () => {
    it('should return correct number of connections', () => {
      expect(wsManager.getConnectionCount()).toBe(0);

      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      wsManager.addConnection('order-1', { socket: socket1 } as any);
      expect(wsManager.getConnectionCount()).toBe(1);

      wsManager.addConnection('order-2', { socket: socket2 } as any);
      expect(wsManager.getConnectionCount()).toBe(2);

      wsManager.closeConnection('order-1');
      expect(wsManager.getConnectionCount()).toBe(1);
    });
  });
});
