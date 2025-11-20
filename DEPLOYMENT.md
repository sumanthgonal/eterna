# Deployment Guide

This guide covers deployment options for the Order Execution Engine.

## Option 1: Render.com (Recommended - Free Tier)

Render provides free PostgreSQL, Redis, and web service hosting.

### Steps:

1. **Create a Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Deploy Using Blueprint**
   - Push your code to GitHub
   - In Render Dashboard, click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml`
   - Click "Apply" to create all services

3. **Initialize Database**
   - Once deployed, go to the PostgreSQL service
   - Open the "Shell" tab
   - Run the schema:
   ```bash
   psql $DATABASE_URL -f /path/to/schema.sql
   ```

4. **Access Your API**
   - Your API will be available at: `https://order-execution-engine.onrender.com`
   - WebSocket endpoint: `wss://order-execution-engine.onrender.com/api/orders/:orderId/ws`

### Important Notes:
- Free tier services sleep after 15 minutes of inactivity
- First request after sleep may take 30-60 seconds
- PostgreSQL free tier: 256MB storage
- Redis free tier: 25MB storage

## Option 2: Railway.app

Railway offers generous free tier with easy deployment.

### Steps:

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and Initialize**
   ```bash
   railway login
   railway init
   ```

3. **Add Services**
   ```bash
   railway add --service postgres
   railway add --service redis
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Set Environment Variables**
   - Go to Railway dashboard
   - Add environment variables from `.env.example`
   - Railway automatically sets database URLs

6. **Run Database Migration**
   ```bash
   railway run psql $DATABASE_URL -f src/db/schema.sql
   ```

## Option 3: Docker Compose (Local/VPS)

For local development or deploying to a VPS.

### Steps:

1. **Build and Start Services**
   ```bash
   docker-compose up -d
   ```

2. **View Logs**
   ```bash
   docker-compose logs -f app
   ```

3. **Stop Services**
   ```bash
   docker-compose down
   ```

### Access:
- API: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Option 4: Heroku

### Steps:

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Create App**
   ```bash
   heroku create order-execution-engine
   ```

3. **Add Add-ons**
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   heroku addons:create heroku-redis:mini
   ```

4. **Set Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set MAX_CONCURRENT_ORDERS=10
   # ... other env vars
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

6. **Initialize Database**
   ```bash
   heroku pg:psql < src/db/schema.sql
   ```

## Environment Variables

All deployment platforms require these environment variables:

```bash
NODE_ENV=production
PORT=3000
POSTGRES_HOST=<provided by platform>
POSTGRES_PORT=5432
POSTGRES_DB=order_execution
POSTGRES_USER=<provided by platform>
POSTGRES_PASSWORD=<provided by platform>
REDIS_HOST=<provided by platform>
REDIS_PORT=6379
MAX_CONCURRENT_ORDERS=10
ORDERS_PER_MINUTE=100
MAX_RETRIES=3
RAYDIUM_LATENCY_MS=200
METEORA_LATENCY_MS=200
EXECUTION_LATENCY_MS=2500
```

## Database Initialization

After deploying, you must initialize the database schema:

### Using psql:
```bash
psql $DATABASE_URL -f src/db/schema.sql
```

### Using node-pg:
Create a migration script or use the provided schema in `src/db/schema.sql`.

## Health Checks

All platforms should monitor:
- GET `/health` - Returns 200 if API is running
- GET `/api/queue/metrics` - Queue health metrics

## Scaling Considerations

### Free Tier Limitations:
- **Render**: Services sleep after 15min inactivity
- **Railway**: $5/month free credit
- **Heroku**: Dyno sleeps after 30min inactivity

### Production Scaling:
- Upgrade to paid tiers for:
  - Always-on services
  - More PostgreSQL storage
  - More Redis memory
  - Multiple worker dynos/instances

### Performance Tips:
1. Use connection pooling (already configured)
2. Monitor queue metrics
3. Adjust `MAX_CONCURRENT_ORDERS` based on load
4. Set up alerts for failed orders
5. Use CDN for static assets if needed

## Monitoring

Recommended monitoring setup:
- Application logs: Built-in platform logging
- Error tracking: Sentry.io (free tier available)
- Uptime monitoring: UptimeRobot (free)
- Performance: New Relic or DataDog

## Troubleshooting

### Database Connection Fails
- Check environment variables are set correctly
- Verify database service is running
- Check firewall/security group settings

### Redis Connection Fails
- Ensure Redis service is running
- Verify Redis URL format
- Check network connectivity

### Orders Not Processing
- Check queue metrics at `/api/queue/metrics`
- View logs for error messages
- Verify BullMQ worker is running

### WebSocket Connection Issues
- Ensure platform supports WebSocket
- Check for reverse proxy WebSocket configuration
- Verify SSL/TLS if using wss://

## Cost Estimates

### Free Tier (Render):
- Web Service: Free
- PostgreSQL: Free (256MB)
- Redis: Free (25MB)
- **Total: $0/month**

### Paid Tier (Render):
- Web Service: $7/month
- PostgreSQL: $7/month (1GB)
- Redis: $10/month (100MB)
- **Total: $24/month**

### Railway:
- $5 free credit/month
- $0.000463/GB-hour for usage
- Estimated: $5-15/month for small load

### Heroku:
- Hobby Dynos: $7/month
- Essential PostgreSQL: $5/month
- Mini Redis: $3/month
- **Total: $15/month**
