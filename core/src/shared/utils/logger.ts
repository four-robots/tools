export class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  info(message: string, data?: any): void {
    console.log(`[${new Date().toISOString()}] [${this.component}] INFO: ${message}`, data || '');
  }

  debug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${new Date().toISOString()}] [${this.component}] DEBUG: ${message}`, data || '');
    }
  }

  warn(message: string, data?: any): void {
    console.warn(`[${new Date().toISOString()}] [${this.component}] WARN: ${message}`, data || '');
  }

  error(message: string, error?: any, data?: any): void {
    console.error(`[${new Date().toISOString()}] [${this.component}] ERROR: ${message}`, error, data || '');
  }
}