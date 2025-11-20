export enum OrderType {
  MARKET = 'market',
  LIMIT = 'limit',
  SNIPER = 'sniper'
}

export enum OrderStatus {
  PENDING = 'pending',
  ROUTING = 'routing',
  BUILDING = 'building',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  FAILED = 'failed'
}

export enum DexType {
  RAYDIUM = 'raydium',
  METEORA = 'meteora'
}

export interface Order {
  orderId: string;
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  slippage: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  txHash?: string;
  executedPrice?: number;
  executedAmount?: number;
  dex?: DexType;
  error?: string;
  retryCount?: number;
}

export interface DexQuote {
  dex: DexType;
  price: number;
  fee: number;
  outputAmount: number;
  priceImpact: number;
}

export interface ExecutionResult {
  txHash: string;
  executedPrice: number;
  executedAmount: number;
  dex: DexType;
}

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: Date;
  txHash?: string;
  executedPrice?: number;
  error?: string;
  dex?: DexType;
  routing?: {
    raydium: DexQuote;
    meteora: DexQuote;
    selected: DexType;
  };
}

export interface CreateOrderRequest {
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  slippage?: number;
}

export interface CreateOrderResponse {
  orderId: string;
  status: OrderStatus;
}
