# Alert Processor Worker

A TypeScript background worker for processing search alerts and delivering notifications in the MCP Tools ecosystem.

## Overview

The Alert Processor Worker is responsible for:

- **Scheduled Alert Processing**: Executes alerts based on their schedule configuration (cron, interval, real-time)
- **Search Execution**: Runs saved searches and evaluates trigger conditions
- **Multi-channel Notifications**: Delivers notifications via email, webhook, SMS, and in-app channels
- **Rate Limiting**: Prevents notification spam with configurable rate limits
- **Error Handling**: Robust retry logic and failure recovery
- **Monitoring**: Comprehensive metrics and health monitoring

## Features

### Alert Processing
- Processes alerts based on schedule type (manual, interval, cron, real-time)
- Evaluates trigger conditions (result threshold, change detection, custom conditions)
- Supports concurrent processing with configurable limits
- Automatic retry logic for failed executions

### Notification Delivery
- **Email**: SendGrid, AWS SES integration
- **Webhook**: HTTP/HTTPS webhook delivery with custom headers
- **SMS**: Twilio, AWS SNS integration  
- **In-App**: Real-time in-app notifications
- Template-based message rendering with variable substitution
- Delivery status tracking and engagement metrics

### Monitoring & Reliability
- Comprehensive logging with configurable levels
- Metrics collection and health monitoring
- Graceful shutdown with proper cleanup
- Database connection management
- Scheduled maintenance tasks

## Configuration

The worker is configured via environment variables:

### Database Configuration
```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=mcp_tools
DATABASE_URL=postgresql://user:pass@host:port/db  # Alternative to individual settings
```

### Worker Configuration
```bash
ALERT_PROCESS_INTERVAL=30000          # Processing interval in ms (default: 30s)
MAX_CONCURRENT_ALERTS=10              # Max concurrent alert processing (default: 10)
MAX_RETRY_ATTEMPTS=3                  # Max retry attempts for failed alerts (default: 3)
RETRY_DELAY_MS=5000                   # Delay between retries in ms (default: 5s)
GRACEFUL_SHUTDOWN_TIMEOUT=30000       # Shutdown timeout in ms (default: 30s)
```

### Notification Configuration
```bash
ENABLE_EMAIL_NOTIFICATIONS=true      # Enable email notifications (default: true)
ENABLE_WEBHOOK_NOTIFICATIONS=true    # Enable webhook notifications (default: true)
ENABLE_SMS_NOTIFICATIONS=false       # Enable SMS notifications (default: false)
ENABLE_INAPP_NOTIFICATIONS=true      # Enable in-app notifications (default: true)

EMAIL_PROVIDER=mock                   # Email provider: sendgrid, aws-ses, mock
SMS_PROVIDER=mock                     # SMS provider: twilio, aws-sns, mock
WEBHOOK_TIMEOUT=10000                 # Webhook request timeout in ms (default: 10s)
```

### External Service Configuration
```bash
# SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# AWS
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
```

### Monitoring Configuration
```bash
LOG_LEVEL=info                        # Log level: error, warn, info, debug (default: info)
ENABLE_METRICS=true                   # Enable metrics collection (default: true)
METRICS_PORT=9090                     # Metrics server port (default: 9090)
```

### Rate Limiting Configuration
```bash
RATE_LIMITING_ENABLED=true            # Enable rate limiting (default: true)
RATE_LIMIT_WINDOW_MS=3600000          # Rate limit window in ms (default: 1 hour)
MAX_ALERTS_PER_WINDOW=1000            # Max alerts per window (default: 1000)
```

## Installation

### Prerequisites
- Node.js 18+ 
- PostgreSQL database with MCP Tools schema
- Core package built (`cd ../../core && npm run build`)

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Testing
```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Type Checking
```bash
npm run typecheck
```

## Architecture

### Worker Components

1. **AlertProcessorWorker**: Main worker class that orchestrates alert processing
2. **Configuration Manager**: Loads and validates environment configuration
3. **Service Layer**: Integrates with core MCP Tools services (AlertService, NotificationService, etc.)
4. **Scheduling Engine**: Manages cron-based and interval-based alert execution
5. **Rate Limiter**: Prevents notification spam and resource overload

### Processing Flow

1. **Scheduled Check**: Worker periodically checks for alerts ready for execution
2. **Alert Retrieval**: Fetches alerts from database based on schedule configuration
3. **Search Execution**: Executes associated saved searches using UnifiedSearchService
4. **Condition Evaluation**: Evaluates trigger conditions against search results
5. **Notification Delivery**: Sends notifications via configured channels if conditions are met
6. **Status Updates**: Updates alert execution history and schedules next run

### Error Handling

- **Retry Logic**: Failed alerts are retried with exponential backoff
- **Dead Letter Queue**: Permanently failed alerts are logged for manual review
- **Graceful Degradation**: Worker continues processing other alerts if individual alerts fail
- **Health Monitoring**: Continuous health checks and status reporting

## Monitoring

### Metrics

The worker exposes various metrics for monitoring:

- `alertsProcessed`: Total number of alerts processed
- `alertsSucceeded`: Number of successfully processed alerts
- `alertsFailed`: Number of failed alert executions
- `notificationsSent`: Total notifications delivered
- `notificationsFailed`: Number of failed notification deliveries
- `uptime`: Worker uptime in milliseconds
- `tasksScheduled`: Number of active scheduled tasks

### Logging

Structured logging with configurable levels:

- **DEBUG**: Detailed processing information
- **INFO**: General operational information
- **WARN**: Warning conditions that don't stop processing
- **ERROR**: Error conditions that may affect functionality

### Health Checks

The worker provides health status information including:

- Database connectivity status
- Processing queue status
- Last successful execution time
- Configuration summary
- Active task count

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/

# Set environment
ENV NODE_ENV=production

# Start worker
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  alert-processor:
    image: mcp-tools-alert-processor
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/mcp_tools
      - LOG_LEVEL=info
      - ENABLE_EMAIL_NOTIFICATIONS=true
      - EMAIL_PROVIDER=sendgrid
      - SENDGRID_API_KEY=${SENDGRID_API_KEY}
    depends_on:
      - postgres
    restart: unless-stopped
    
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=mcp_tools
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alert-processor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: alert-processor
  template:
    metadata:
      labels:
        app: alert-processor
    spec:
      containers:
      - name: worker
        image: mcp-tools-alert-processor:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: SENDGRID_API_KEY
          valueFrom:
            secretKeyRef:
              name: notification-secrets
              key: sendgrid-api-key
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          exec:
            command: ["/bin/sh", "-c", "ps aux | grep '[n]ode dist/index.js' || exit 1"]
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          exec:
            command: ["/bin/sh", "-c", "ps aux | grep '[n]ode dist/index.js' || exit 1"]
          initialDelaySeconds: 10
          periodSeconds: 10
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify PostgreSQL is running and accessible
   - Check connection string and credentials
   - Ensure database contains required tables (run migrations)

2. **Alerts Not Processing**
   - Check alert schedules and next execution times
   - Verify alerts are active (`is_active = true`)
   - Review worker logs for processing errors

3. **Notifications Not Sending**
   - Verify notification channel configurations
   - Check external service credentials (SendGrid, Twilio, etc.)
   - Review notification templates for syntax errors

4. **High Memory Usage**
   - Reduce `MAX_CONCURRENT_ALERTS` setting
   - Check for memory leaks in search query processing
   - Monitor database connection pool usage

5. **Worker Crashes**
   - Review uncaught exception logs
   - Check database connectivity
   - Verify all required environment variables are set

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

This provides detailed information about:
- Alert processing flow
- Search query execution
- Notification delivery attempts
- Database operations
- Scheduling decisions

### Performance Tuning

1. **Concurrency**: Adjust `MAX_CONCURRENT_ALERTS` based on system resources
2. **Processing Interval**: Tune `ALERT_PROCESS_INTERVAL` for responsiveness vs. resource usage
3. **Database Connections**: Optimize PostgreSQL pool settings for workload
4. **Rate Limiting**: Configure appropriate limits to prevent system overload

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update documentation for API changes
4. Ensure proper error handling and logging
5. Test with various notification providers

## License

MIT License - see the main project LICENSE file for details.