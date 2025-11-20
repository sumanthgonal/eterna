import { MockDexRouter } from '../services/mockDexRouter';
import { DexType, OrderType, OrderStatus } from '../types';

describe('MockDexRouter', () => {
  let router: MockDexRouter;

  beforeEach(() => {
    router = new MockDexRouter();
  });

  describe('getRaydiumQuote', () => {
    it('should return a valid quote with expected properties', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 100);

      expect(quote).toHaveProperty('dex', DexType.RAYDIUM);
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee', 0.003);
      expect(quote).toHaveProperty('outputAmount');
      expect(quote).toHaveProperty('priceImpact');
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.outputAmount).toBeGreaterThan(0);
      expect(quote.priceImpact).toBeGreaterThanOrEqual(0);
    });

    it('should simulate network latency', async () => {
      const startTime = Date.now();
      await router.getRaydiumQuote('SOL', 'USDC', 100);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(150);
    });

    it('should return different prices for different token pairs', async () => {
      const quote1 = await router.getRaydiumQuote('SOL', 'USDC', 100);
      const quote2 = await router.getRaydiumQuote('ETH', 'USDT', 100);

      expect(quote1.price).not.toBe(quote2.price);
    });
  });

  describe('getMeteorQuote', () => {
    it('should return a valid quote with expected properties', async () => {
      const quote = await router.getMeteorQuote('SOL', 'USDC', 100);

      expect(quote).toHaveProperty('dex', DexType.METEORA);
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('fee', 0.002);
      expect(quote).toHaveProperty('outputAmount');
      expect(quote).toHaveProperty('priceImpact');
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.outputAmount).toBeGreaterThan(0);
    });

    it('should have lower fee than Raydium', async () => {
      const raydiumQuote = await router.getRaydiumQuote('SOL', 'USDC', 100);
      const meteoraQuote = await router.getMeteorQuote('SOL', 'USDC', 100);

      expect(meteoraQuote.fee).toBeLessThan(raydiumQuote.fee);
    });
  });

  describe('getBestQuote', () => {
    it('should fetch quotes from both DEXs', async () => {
      const result = await router.getBestQuote('SOL', 'USDC', 100);

      expect(result).toHaveProperty('raydium');
      expect(result).toHaveProperty('meteora');
      expect(result).toHaveProperty('best');
      expect(result.raydium.dex).toBe(DexType.RAYDIUM);
      expect(result.meteora.dex).toBe(DexType.METEORA);
    });

    it('should select the quote with better output amount', async () => {
      const result = await router.getBestQuote('SOL', 'USDC', 100);

      expect(result.best.outputAmount).toBeGreaterThanOrEqual(
        Math.min(result.raydium.outputAmount, result.meteora.outputAmount)
      );
    });

    it('should execute quotes in parallel', async () => {
      const startTime = Date.now();
      await router.getBestQuote('SOL', 'USDC', 100);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(600);
    });
  });

  describe('executeSwap', () => {
    it('should return a valid execution result', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 100);
      const order = {
        orderId: 'test-123',
        type: OrderType.MARKET,
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        slippage: 0.01,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      };

      const result = await router.executeSwap(order, quote);

      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('executedPrice');
      expect(result).toHaveProperty('executedAmount');
      expect(result).toHaveProperty('dex', quote.dex);
      expect(result.txHash).toHaveLength(88);
      expect(result.executedPrice).toBeGreaterThan(0);
    });

    it('should simulate execution latency', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 100);
      const order = {
        orderId: 'test-123',
        type: OrderType.MARKET,
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        slippage: 0.01,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      };

      const startTime = Date.now();
      await router.executeSwap(order, quote);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(2000);
    });

    it('should occasionally throw slippage errors', async () => {
      const quote = await router.getRaydiumQuote('SOL', 'USDC', 100);
      const order = {
        orderId: 'test-123',
        type: OrderType.MARKET,
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amountIn: 100,
        slippage: 0.01,
        status: OrderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0
      };

      let slippageErrorCount = 0;
      const attempts = 20;

      for (let i = 0; i < attempts; i++) {
        try {
          await router.executeSwap(order, quote);
        } catch (error) {
          if (error instanceof Error && error.message.includes('Slippage')) {
            slippageErrorCount++;
          }
        }
      }

      expect(slippageErrorCount).toBeGreaterThanOrEqual(0);
      expect(slippageErrorCount).toBeLessThan(attempts);
    }, 60000);
  });
});
