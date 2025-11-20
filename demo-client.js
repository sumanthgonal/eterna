#!/usr/bin/env node

/**
 * Demo Client for Order Execution Engine
 *
 * This script demonstrates:
 * 1. Submitting multiple concurrent orders
 * 2. Connecting to WebSocket for real-time status updates
 * 3. Viewing DEX routing decisions
 * 4. Tracking order lifecycle
 */

const http = require('http');
const WebSocket = require('ws');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const WS_BASE = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function submitOrder(orderData) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/orders/execute', API_BASE);
    const postData = JSON.stringify(orderData);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function connectWebSocket(orderId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/orders/${orderId}/ws`);
    const updates = [];

    ws.on('open', () => {
      log(`\n[${orderId.substring(0, 8)}...] WebSocket connected`, 'cyan');
    });

    ws.on('message', (data) => {
      const update = JSON.parse(data.toString());
      updates.push(update);

      const shortId = orderId.substring(0, 8);

      switch (update.status) {
        case 'pending':
          log(`[${shortId}...] Status: PENDING`, 'yellow');
          break;
        case 'routing':
          log(`[${shortId}...] Status: ROUTING`, 'blue');
          if (update.routing) {
            log(`  Raydium: ${update.routing.raydium.outputAmount.toFixed(4)} tokens (fee: ${(update.routing.raydium.fee * 100).toFixed(2)}%)`, 'reset');
            log(`  Meteora: ${update.routing.meteora.outputAmount.toFixed(4)} tokens (fee: ${(update.routing.meteora.fee * 100).toFixed(2)}%)`, 'reset');
            log(`  Selected: ${update.routing.selected.toUpperCase()}`, 'magenta');
          }
          break;
        case 'building':
          log(`[${shortId}...] Status: BUILDING`, 'blue');
          break;
        case 'submitted':
          log(`[${shortId}...] Status: SUBMITTED`, 'blue');
          break;
        case 'confirmed':
          log(`[${shortId}...] Status: CONFIRMED ✓`, 'green');
          log(`  TxHash: ${update.txHash}`, 'reset');
          log(`  Price: ${update.executedPrice?.toFixed(6)}`, 'reset');
          log(`  DEX: ${update.dex?.toUpperCase()}`, 'reset');
          ws.close();
          resolve(updates);
          break;
        case 'failed':
          log(`[${shortId}...] Status: FAILED ✗`, 'red');
          log(`  Error: ${update.error}`, 'red');
          ws.close();
          resolve(updates);
          break;
      }
    });

    ws.on('error', (error) => {
      log(`[${orderId.substring(0, 8)}...] WebSocket error: ${error.message}`, 'red');
      reject(error);
    });

    ws.on('close', () => {
      log(`[${orderId.substring(0, 8)}...] WebSocket closed\n`, 'cyan');
    });
  });
}

async function runDemo() {
  log('\n========================================', 'bright');
  log('  Order Execution Engine Demo', 'bright');
  log('========================================\n', 'bright');

  const orders = [
    { type: 'market', tokenIn: 'SOL', tokenOut: 'USDC', amountIn: 100, slippage: 0.01 },
    { type: 'market', tokenIn: 'ETH', tokenOut: 'USDT', amountIn: 50, slippage: 0.015 },
    { type: 'market', tokenIn: 'BTC', tokenOut: 'USDC', amountIn: 1, slippage: 0.02 },
    { type: 'market', tokenIn: 'BONK', tokenOut: 'SOL', amountIn: 1000000, slippage: 0.05 },
    { type: 'market', tokenIn: 'RAY', tokenOut: 'USDC', amountIn: 500, slippage: 0.01 }
  ];

  log('Submitting 5 orders concurrently...', 'yellow');
  log('────────────────────────────────────────\n', 'yellow');

  try {
    const submittedOrders = await Promise.all(
      orders.map(async (order, index) => {
        const result = await submitOrder(order);
        log(`Order ${index + 1}: ${order.tokenIn} → ${order.tokenOut} (${order.amountIn})`, 'green');
        log(`  OrderID: ${result.orderId}\n`, 'reset');
        return result;
      })
    );

    log('\n────────────────────────────────────────', 'yellow');
    log('Tracking order execution via WebSocket...', 'yellow');
    log('────────────────────────────────────────', 'yellow');

    const results = await Promise.all(
      submittedOrders.map(order => connectWebSocket(order.orderId))
    );

    log('\n========================================', 'bright');
    log('  Summary', 'bright');
    log('========================================\n', 'bright');

    const successful = results.filter(r => r[r.length - 1].status === 'confirmed').length;
    const failed = results.filter(r => r[r.length - 1].status === 'failed').length;

    log(`Total Orders: ${orders.length}`, 'cyan');
    log(`Successful: ${successful}`, 'green');
    log(`Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
    log('\nDemo completed!', 'bright');

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    log('\nMake sure the server is running:', 'yellow');
    log('  npm run dev\n', 'yellow');
    process.exit(1);
  }
}

if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { submitOrder, connectWebSocket };
