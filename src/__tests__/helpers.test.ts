import { sleep, generateMockTxHash, calculatePriceImpact, retryWithExponentialBackoff } from '../utils/helpers';

describe('Helpers', () => {
  describe('sleep', () => {
    it('should delay execution for specified milliseconds', async () => {
      const startTime = Date.now();
      await sleep(100);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('generateMockTxHash', () => {
    it('should generate a hash of 88 characters', () => {
      const hash = generateMockTxHash();
      expect(hash).toHaveLength(88);
    });

    it('should generate unique hashes', () => {
      const hash1 = generateMockTxHash();
      const hash2 = generateMockTxHash();

      expect(hash1).not.toBe(hash2);
    });

    it('should only contain valid base58 characters', () => {
      const hash = generateMockTxHash();
      const validChars = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

      expect(hash).toMatch(validChars);
    });
  });

  describe('calculatePriceImpact', () => {
    it('should calculate correct price impact percentage', () => {
      const impact = calculatePriceImpact(1000, 100000);
      expect(impact).toBe(1);
    });

    it('should return higher impact for larger amounts', () => {
      const smallImpact = calculatePriceImpact(100, 100000);
      const largeImpact = calculatePriceImpact(10000, 100000);

      expect(largeImpact).toBeGreaterThan(smallImpact);
    });

    it('should return zero impact for zero amount', () => {
      const impact = calculatePriceImpact(0, 100000);
      expect(impact).toBe(0);
    });
  });

  describe('retryWithExponentialBackoff', () => {
    it('should succeed on first attempt if function succeeds', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        return 'success';
      });

      const result = await retryWithExponentialBackoff(fn, 3);

      expect(result).toBe('success');
      expect(attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await retryWithExponentialBackoff(fn, 3, 10);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const fn = jest.fn(async () => {
        throw new Error('Permanent failure');
      });

      await expect(retryWithExponentialBackoff(fn, 2, 10)).rejects.toThrow('Permanent failure');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff delays', async () => {
      let attempts = 0;
      const delays: number[] = [];
      const fn = jest.fn(async () => {
        attempts++;
        if (attempts < 4) {
          throw new Error('Retry');
        }
        return 'done';
      });

      const startTime = Date.now();
      await retryWithExponentialBackoff(fn, 3, 100);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeGreaterThanOrEqual(600);
    });
  });
});
