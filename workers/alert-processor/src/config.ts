import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

/**
 * Configuration schema for alert processor worker
 */
const ConfigSchema = z.object({
  // Database configuration
  postgres: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(5432),
    user: z.string().default('postgres'),
    password: z.string(),
    database: z.string().default('mcp_tools'),
    connectionString: z.string().optional(),
  }),

  // Worker configuration
  worker: z.object({
    processInterval: z.number().default(30000), // 30 seconds
    maxConcurrentAlerts: z.number().default(10),
    maxRetryAttempts: z.number().default(3),
    retryDelayMs: z.number().default(5000),
    gracefulShutdownTimeoutMs: z.number().default(30000),
  }),

  // Notification configuration
  notifications: z.object({
    enableEmail: z.boolean().default(true),
    enableWebhook: z.boolean().default(true),
    enableSms: z.boolean().default(false),
    enableInApp: z.boolean().default(true),
    emailProvider: z.enum(['sendgrid', 'aws-ses', 'mock']).default('mock'),
    webhookTimeout: z.number().default(10000),
    smsProvider: z.enum(['twilio', 'aws-sns', 'mock']).default('mock'),
  }),

  // External service configuration
  services: z.object({
    sendgridApiKey: z.string().optional(),
    twilioAccountSid: z.string().optional(),
    twilioAuthToken: z.string().optional(),
    awsAccessKeyId: z.string().optional(),
    awsSecretAccessKey: z.string().optional(),
    awsRegion: z.string().default('us-east-1'),
  }),

  // Monitoring and logging
  monitoring: z.object({
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    enableMetrics: z.boolean().default(true),
    metricsPort: z.number().default(9090),
  }),

  // Rate limiting
  rateLimiting: z.object({
    enabled: z.boolean().default(true),
    windowMs: z.number().default(3600000), // 1 hour
    maxAlertsPerWindow: z.number().default(1000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const rawConfig = {
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      database: process.env.POSTGRES_DB || 'mcp_tools',
      connectionString: process.env.DATABASE_URL,
    },
    worker: {
      processInterval: parseInt(process.env.ALERT_PROCESS_INTERVAL || '30000'),
      maxConcurrentAlerts: parseInt(process.env.MAX_CONCURRENT_ALERTS || '10'),
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000'),
      gracefulShutdownTimeoutMs: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000'),
    },
    notifications: {
      enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
      enableWebhook: process.env.ENABLE_WEBHOOK_NOTIFICATIONS !== 'false',
      enableSms: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
      enableInApp: process.env.ENABLE_INAPP_NOTIFICATIONS !== 'false',
      emailProvider: (process.env.EMAIL_PROVIDER || 'mock') as 'sendgrid' | 'aws-ses' | 'mock',
      webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000'),
      smsProvider: (process.env.SMS_PROVIDER || 'mock') as 'twilio' | 'aws-sns' | 'mock',
    },
    services: {
      sendgridApiKey: process.env.SENDGRID_API_KEY,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'us-east-1',
    },
    monitoring: {
      logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
    },
    rateLimiting: {
      enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000'),
      maxAlertsPerWindow: parseInt(process.env.MAX_ALERTS_PER_WINDOW || '1000'),
    },
  };

  return ConfigSchema.parse(rawConfig);
}