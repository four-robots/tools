/**
 * Simple Logger for Core Services
 * 
 * Provides basic logging functionality for core services.
 */

export const logger = {
  info: (message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`, data || '');
  },
  
  debug: (message: string, data?: any) => {
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${message}`, data || '');
    }
  },
  
  warn: (message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] ${message}`, data || '');
  },
  
  error: (message: string, error?: any, data?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, error, data || '');
  }
};