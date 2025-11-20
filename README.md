# Order Execution Engine with DEX Routing

A high-performance order execution engine for Solana DEX trading with real-time WebSocket status updates, intelligent routing between Raydium and Meteora, and robust queue management.

## Design Decisions

### Order Type Selection: Market Orders

**Chosen Implementation:** Market Orders

**Reasoning:** Market orders provide immediate execution at current market prices, making them ideal for demonstrating the core architecture of order routing, execution, and real-time status streaming. They execute deterministically without requiring external triggers or continuous price monitoring.

**Extension Path:**
- **Limit Orders:** Add a price monitoring service that polls DEX quotes at regular intervals. When the target price is reached, convert the limit order to a market order and execute through the existing pipeline.
- **Sniper Orders:** Implement a token launch detector using Solana WebSocket subscriptions to monitor for new token creation events. Upon detection, trigger immediate execution through the market order engine with prioritized queue placement.

### Architecture Highlights

1. **Mock DEX Implementation:** Simulates realistic Raydium and Meteora behavior with:
   - Configurable network latency (200ms per quote)
   - Different fee structures (Raydium: 0.3%, Meteora: 0.2%)
   - Price variance and slippage simulation
   - Execution delays (2-3 seconds)

2. **Queue-Based Processing:** Uses BullMQ with Redis for:
   - Concurrent order processing (10 simultaneous orders)
   - Rate limiting (100 orders/minute)
   - Automatic retries with exponential backoff
   - Job persistence and failure recovery

3. **HTTP → WebSocket Pattern:** Single endpoint that:
   - Accepts POST request for order submission
   - Returns orderId immediately
   - Client connects to WebSocket endpoint for live updates
   - Streams all status changes (pending → routing → building → submitted → confirmed)

4. **DEX Routing Logic:** Compares quotes from both DEXs considering:
   - Output amount after fees
   - Price impact based on liquidity depth
   - Execution price variance
   - Automatically selects best route for user

## Tech Stack

- **Node.js + TypeScript** - Type-safe backend
- **Fastify** - High-performance web framework
- **@fastify/websocket** - WebSocket support
- **BullMQ** - Redis-based queue for order processing
- **PostgreSQL** - Persistent order storage and history
- **Redis** - Active order state and queue management
- **Jest** - Testing framework with 30+ test cases

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and adjust settings:

```bash
cp .env.example .env
```

Key configurations:
- `PORT` - Server port (default: 3000)
- `POSTGRES_*` - Database connection settings
- `REDIS_*` - Redis connection settings
- `MAX_CONCURRENT_ORDERS` - Concurrent order limit (default: 10)
- `ORDERS_PER_MINUTE` - Rate limit (default: 100)

### 3. Initialize Database

Create the database and run the schema:

```bash
# Create database (if needed)
createdb order_execution

# Run schema
psql -U postgres -d order_execution -f src/db/schema.sql
```

Or use the npm script:

```bash
npm run db:init
```

### 4. Start Redis

Ensure Redis is running:

```bash
# macOS/Linux
redis-server

# Windows (with Redis installed)
redis-server.exe
```

### 5. Build and Run

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### 6. Run Tests

```bash
npm test
```

## API Endpoints

### POST /api/orders/execute

Submit a new order for execution.

**Request:**
```json
{
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 100,
  "slippage": 0.01
}
```

**Response:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

### WebSocket: /api/orders/:orderId/ws

Connect to receive real-time order status updates.

**Status Updates:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "routing",
  "timestamp": "2025-11-19T10:30:00.000Z",
  "routing": {
    "raydium": {
      "dex": "raydium",
      "price": 3.15,
      "fee": 0.003,
      "outputAmount": 314.55,
      "priceImpact": 0.1
    },
    "meteora": {
      "dex": "meteora",
      "price": 3.18,
      "fee": 0.002,
      "outputAmount": 317.64,
      "priceImpact": 0.083
    },
    "selected": "meteora"
  }
}
```

**Confirmed Status:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "timestamp": "2025-11-19T10:30:05.000Z",
  "txHash": "4Hj8k...",
  "executedPrice": 3.17,
  "dex": "meteora"
}
```

### GET /api/orders/:orderId

Retrieve order details.

**Response:**
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 100,
  "slippage": 0.01,
  "status": "confirmed",
  "txHash": "4Hj8k...",
  "executedPrice": 3.17,
  "executedAmount": 316.83,
  "dex": "meteora",
  "createdAt": "2025-11-19T10:30:00.000Z",
  "updatedAt": "2025-11-19T10:30:05.000Z"
}
```

### GET /api/orders/:orderId/history

Get full status history for an order.

### GET /api/orders

List recent orders (default: 100).

### GET /api/queue/metrics

View queue health metrics.

**Response:**
```json
{
  "waiting": 5,
  "active": 8,
  "completed": 1247,
  "failed": 3,
  "total": 1263,
  "websocketConnections": 12
}
```

### GET /health

Health check endpoint.

## Order Lifecycle

```
1. PENDING     → Order received and queued
2. ROUTING     → Fetching quotes from Raydium and Meteora
3. BUILDING    → Creating transaction with selected DEX
4. SUBMITTED   → Transaction sent to network
5. CONFIRMED   → Transaction successful (includes txHash)
   OR
   FAILED      → Execution failed after retries
```

## Error Handling & Retry Logic

- **Exponential Backoff:** Retries with delays of 1s, 2s, 4s
- **Max Retries:** 3 attempts per order
- **Failure Tracking:** All failures logged to database with reason
- **Slippage Protection:** Orders fail if slippage exceeds tolerance

## Testing

The project includes 30+ comprehensive tests covering:

- ✅ DEX quote generation and routing logic
- ✅ Order execution with retry mechanisms
- ✅ WebSocket connection management
- ✅ Queue behavior under load
- ✅ Helper utilities (retry, hash generation, price impact)

Run tests with coverage:
```bash
npm test
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database and Redis configuration
│   ├── db/              # Database schema and repositories
│   ├── routes/          # API route handlers
│   ├── services/        # Core business logic
│   │   ├── mockDexRouter.ts      # DEX simulation
│   │   ├── orderExecutor.ts      # Order execution engine
│   │   ├── orderQueue.ts         # BullMQ queue management
│   │   └── websocketManager.ts   # WebSocket connections
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Helper functions
│   ├── __tests__/       # Test suites
│   └── server.ts        # Application entry point
├── .env.example         # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Demo Video

[Link to YouTube demo video]

## API Collection

See `postman_collection.json` for complete API examples including:
- Order submission
- WebSocket connection testing
- Concurrent order processing
- Error scenarios

## Deployment

This application can be deployed to:

- **Render.com** (Recommended - Free tier with PostgreSQL & Redis)
- **Railway.app**
- **Heroku**

### Render Deployment

1. Create a new Web Service
2. Add PostgreSQL and Redis add-ons
3. Set environment variables from `.env.example`
4. Deploy with build command: `npm run build`
5. Start command: `npm start`

## License

MIT

## Author

Built for Solana DEX Trading Backend Challenge
