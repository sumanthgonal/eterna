import { DexQuote, DexType, ExecutionResult, Order } from '../types';
import { sleep, generateMockTxHash, calculatePriceImpact } from '../utils/helpers';

export class MockDexRouter {
  private raydiumLatency: number;
  private meteoraLatency: number;
  private executionLatency: number;

  constructor() {
    this.raydiumLatency = parseInt(process.env.RAYDIUM_LATENCY_MS || '200');
    this.meteoraLatency = parseInt(process.env.METEORA_LATENCY_MS || '200');
    this.executionLatency = parseInt(process.env.EXECUTION_LATENCY_MS || '2500');
  }

  async getRaydiumQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<DexQuote> {
    await sleep(this.raydiumLatency);

    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const priceVariance = 0.98 + Math.random() * 0.04;
    const price = basePrice * priceVariance;

    const fee = 0.003;
    const liquidityDepth = 100000;
    const priceImpact = calculatePriceImpact(amountIn, liquidityDepth);

    const effectivePrice = price * (1 - priceImpact / 100);
    const outputAmount = (amountIn * effectivePrice) * (1 - fee);

    return {
      dex: DexType.RAYDIUM,
      price: effectivePrice,
      fee,
      outputAmount,
      priceImpact
    };
  }

  async getMeteorQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<DexQuote> {
    await sleep(this.meteoraLatency);

    const basePrice = this.getBasePrice(tokenIn, tokenOut);
    const priceVariance = 0.97 + Math.random() * 0.05;
    const price = basePrice * priceVariance;

    const fee = 0.002;
    const liquidityDepth = 120000;
    const priceImpact = calculatePriceImpact(amountIn, liquidityDepth);

    const effectivePrice = price * (1 - priceImpact / 100);
    const outputAmount = (amountIn * effectivePrice) * (1 - fee);

    return {
      dex: DexType.METEORA,
      price: effectivePrice,
      fee,
      outputAmount,
      priceImpact
    };
  }

  async getBestQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: number
  ): Promise<{ raydium: DexQuote; meteora: DexQuote; best: DexQuote }> {
    const [raydiumQuote, meteoraQuote] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amountIn),
      this.getMeteorQuote(tokenIn, tokenOut, amountIn)
    ]);

    const bestQuote = raydiumQuote.outputAmount > meteoraQuote.outputAmount
      ? raydiumQuote
      : meteoraQuote;

    console.log('DEX Routing Decision:', {
      raydium: {
        outputAmount: raydiumQuote.outputAmount.toFixed(6),
        price: raydiumQuote.price.toFixed(6),
        fee: `${(raydiumQuote.fee * 100).toFixed(2)}%`,
        priceImpact: `${raydiumQuote.priceImpact.toFixed(3)}%`
      },
      meteora: {
        outputAmount: meteoraQuote.outputAmount.toFixed(6),
        price: meteoraQuote.price.toFixed(6),
        fee: `${(meteoraQuote.fee * 100).toFixed(2)}%`,
        priceImpact: `${meteoraQuote.priceImpact.toFixed(3)}%`
      },
      selected: bestQuote.dex,
      reason: `Better output by ${Math.abs(raydiumQuote.outputAmount - meteoraQuote.outputAmount).toFixed(6)} tokens`
    });

    return {
      raydium: raydiumQuote,
      meteora: meteoraQuote,
      best: bestQuote
    };
  }

  async executeSwap(order: Order, quote: DexQuote): Promise<ExecutionResult> {
    const executionTime = this.executionLatency + Math.random() * 1000;
    await sleep(executionTime);

    const slippageOccurred = Math.random();
    if (slippageOccurred > 0.95) {
      throw new Error('Slippage tolerance exceeded');
    }

    const executionVariance = 0.995 + Math.random() * 0.01;
    const finalPrice = quote.price * executionVariance;
    const finalAmount = quote.outputAmount * executionVariance;

    const txHash = generateMockTxHash();

    console.log(`Swap executed on ${quote.dex}:`, {
      txHash,
      executedPrice: finalPrice.toFixed(6),
      executedAmount: finalAmount.toFixed(6),
      executionTime: `${executionTime.toFixed(0)}ms`
    });

    return {
      txHash,
      executedPrice: finalPrice,
      executedAmount: finalAmount,
      dex: quote.dex
    };
  }

  private getBasePrice(tokenIn: string, tokenOut: string): number {
    const seed = tokenIn.charCodeAt(0) + tokenOut.charCodeAt(0);
    const randomSeed = Math.sin(seed) * 10000;
    return 0.5 + (randomSeed - Math.floor(randomSeed)) * 10;
  }
}
